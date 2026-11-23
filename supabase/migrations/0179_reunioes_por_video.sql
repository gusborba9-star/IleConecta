-- 0179 — Reuniões e consultas por vídeo: banco de minutos, agendamento e acesso (22/11/2026). Peça 2 do vídeo (a peça 1 foi o limite na matriz, 0178).
-- Decisões do proprietário (22/11/2026): vídeo só nos planos com minutos na matriz (0 = sem vídeo); reunião com membros e consulta individual
-- usam o MESMO banco mensal de minutos de participante; teto por reunião de 100 pessoas e 90 minutos; sem gravação; provedor trocável no
-- painel (Daily principal, Whereby Embedded alternativo); nada liga sozinho: o vídeo nasce DESLIGADO.
-- A tela e o provedor ficam na função de borda; aqui ficam as regras que não podem depender do aparelho: quem pode marcar, quem pode entrar,
-- quanto sobrou do mês e o registro do consumo (só a função de borda, com a chave de serviço, grava consumo).
-- Privacidade: o consumo guarda quem entrou, quando entrou e quando saiu (para conferir o banco e resolver disputas); 12 meses, depois
-- apagado sozinho. Nada de áudio, vídeo, mensagem ou gravação passa por aqui.

-- ============ 1) configuração do vídeo no painel (desligado, provedor Daily) ============
create or replace function public.video_config_ok(v jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare x jsonb;
begin
  if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v) k) is distinct from array['beta_houses', 'provider', 'state'] then return false; end if;
  if (v ->> 'state') is null or (v ->> 'state') not in ('off', 'beta', 'on') then return false; end if;
  if (v ->> 'provider') is null or (v ->> 'provider') not in ('daily', 'whereby') then return false; end if;
  if coalesce(jsonb_typeof(v -> 'beta_houses'), '') <> 'array' or jsonb_array_length(v -> 'beta_houses') > 200 then return false; end if;
  for x in select jsonb_array_elements(v -> 'beta_houses') loop
    if coalesce(jsonb_typeof(x), '') <> 'string' or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  end loop;
  return true;
end $$;

alter table public.platform_settings drop constraint if exists platform_settings_key_check;
alter table public.platform_settings add constraint platform_settings_key_check
  check (key = any (array['features', 'pricing', 'scopes', 'payment_limits', 'referral', 'plan_matrix', 'billing_config', 'billing_prices', 'maintenance', 'video']));

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old_val jsonb;
begin
if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
if p_key not in ('features', 'pricing', 'scopes', 'payment_limits', 'referral', 'plan_matrix', 'billing_config', 'billing_prices', 'video') then raise exception 'invalid_key'; end if;
if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
raise exception 'invalid_value';
end if;
if p_key = 'payment_limits' then
if jsonb_typeof(p_value -> 'max_cents') <> 'number'
or (p_value ->> 'max_cents') !~ '^[0-9]+$'
or (p_value ->> 'max_cents')::bigint not between 10000 and 10000000 then
raise exception 'O teto por pagamento deve ficar entre R$ 100 e R$ 100.000.';
end if;
end if;
if p_key = 'referral' then
if (p_value ->> 'reward_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'reward_days')::int not between 1 and 90
or (p_value ->> 'referred_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'referred_days')::int not between 0 and 90
or (p_value ->> 'monthly_cap') !~ '^[0-9]{1,3}$' or (p_value ->> 'monthly_cap')::int not between 1 and 100 then
raise exception 'Dias de prêmio entre 1 e 90, dias da casa indicada entre 0 e 90 e limite mensal entre 1 e 100.';
end if;
end if;
if p_key = 'plan_matrix' and not public.plan_matrix_ok(p_value) then
raise exception 'Matriz de planos inválida: confira os limites (números inteiros dentro da faixa) e os textos.';
end if;
if p_key = 'billing_config' and not public.billing_config_ok(p_value) then
raise exception 'Configuração de cobrança inválida: confira avisos (1 a 15 dias), tolerância (0 a 10 dias úteis), provedor e meios de cada cobrança.';
end if;
if p_key = 'billing_prices' and not public.billing_prices_ok(p_value) then
raise exception 'Preços de cobrança inválidos: valores em centavos entre R$ 1,00 e R$ 10.000,00 (destaque e impulsionamento podem ficar em branco).';
end if;
if p_key = 'video' and not public.video_config_ok(p_value) then
raise exception 'Configuração de vídeo inválida: estado (desligado, piloto ou ligado), provedor (Daily ou Whereby) e até 200 casas piloto.';
end if;
select value into old_val from public.platform_settings where key = p_key;
insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), p_key, old_val, p_value);
end $$;

insert into public.platform_settings (key, value) values ('video', '{"state":"off","provider":"daily","beta_houses":[]}'::jsonb) on conflict (key) do nothing;

-- Vídeo ligado para esta casa? "on" vale para todas; "beta" só para as casas piloto (ids dos donos). Sempre exige minutos no plano.
create or replace function public.video_enabled_for(p_house uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; h record;
begin
  select value into cfg from public.platform_settings where key = 'video';
  if cfg is null or not public.video_config_ok(cfg) then return false; end if;
  select owner_id, plan::text as plan into h from public.houses where id = p_house;
  if not found then return false; end if;
  if public.plan_cap_int(h.plan, 'video_minutes_month') <= 0 then return false; end if;
  return case cfg ->> 'state'
    when 'on' then true
    when 'beta' then (cfg -> 'beta_houses') ? h.owner_id::text
    else false end;
end $$;

-- ============ 2) reuniões e consumo ============
create table if not exists public.video_meetings (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  kind text not null check (kind in ('reuniao', 'consulta')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at timestamptz not null,
  duration_min int not null check (duration_min between 5 and 90),
  max_participants int not null check (max_participants between 2 and 100),
  order_id uuid references public.service_orders(id) on delete set null,
  invitee_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('daily', 'whereby')),
  room_name text not null unique,
  status text not null default 'agendada' check (status in ('agendada', 'encerrada', 'cancelada')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (kind = 'consulta' or invitee_id is null)
);
create index if not exists video_meetings_house_idx on public.video_meetings (house_id, starts_at desc);
alter table public.video_meetings enable row level security;
revoke all on public.video_meetings from public, anon, authenticated;

create table if not exists public.video_usage (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.video_meetings(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 100),
  user_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null,
  left_at timestamptz,
  minutes int not null default 0 check (minutes >= 0),
  created_at timestamptz not null default now(),
  unique (meeting_id, session_id)
);
create index if not exists video_usage_house_idx on public.video_usage (house_id, joined_at);
alter table public.video_usage enable row level security;
revoke all on public.video_usage from public, anon, authenticated;

-- Banco do mês (fuso de Brasília): minutos do plano, usados, restantes. Só dono da casa ou administração.
create or replace function public.video_month_start() returns timestamptz
language sql stable as $$ select (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' $$;

create or replace function public.video_bank_of(p_house uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_plan text; v_cap int; v_used int;
begin
  select plan::text into v_plan from public.houses where id = p_house;
  if v_plan is null then return jsonb_build_object('cap', 0, 'used', 0, 'remaining', 0); end if;
  v_cap := public.plan_cap_int(v_plan, 'video_minutes_month');
  select coalesce(sum(minutes), 0)::int into v_used from public.video_usage where house_id = p_house and joined_at >= public.video_month_start();
  return jsonb_build_object('cap', v_cap, 'used', v_used, 'remaining', greatest(v_cap - v_used, 0));
end $$;

create or replace function public.video_bank(p_house uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_house_owner(p_house) or public.is_admin()) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return public.video_bank_of(p_house) || jsonb_build_object('enabled', public.video_enabled_for(p_house));
end $$;

-- Marcar reunião (com membros) ou consulta (com o cliente de um pedido). Só o dono da casa.
create or replace function public.video_schedule(p_house uuid, p_kind text, p_title text, p_starts_at timestamptz, p_duration_min int, p_max_participants int default 50, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prov text; v_bank jsonb; v_invitee uuid; v_id uuid := gen_random_uuid(); v_max int := p_max_participants;
begin
  if v_uid is null or not public.is_house_owner(p_house) then raise exception 'Só o responsável pela casa marca reuniões por vídeo.' using errcode = '42501'; end if;
  if not public.video_enabled_for(p_house) then raise exception 'O vídeo não está disponível para a sua casa ainda.'; end if;
  if p_kind not in ('reuniao', 'consulta') then raise exception 'Tipo inválido.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'Dê um título de até 80 letras.'; end if;
  if p_duration_min is null or p_duration_min not between 5 and 90 then raise exception 'A duração vai de 5 a 90 minutos.'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '120 days' then raise exception 'Escolha um horário a partir de agora e em até 120 dias.'; end if;
  if (select count(*) from public.video_meetings where house_id = p_house and status = 'agendada' and starts_at >= now() - interval '1 day') >= 60 then raise exception 'Muitas reuniões marcadas: cancele ou espere as próximas acontecerem.'; end if;
  v_bank := public.video_bank_of(p_house);
  if (v_bank ->> 'remaining')::int <= 0 then raise exception 'Os minutos de vídeo deste mês acabaram.'; end if;
  if p_kind = 'consulta' then
    select o.client_id into v_invitee from public.service_orders o where o.id = p_order and o.house_id = p_house;
    if v_invitee is null then raise exception 'Escolha um pedido desta casa para a consulta.'; end if;
    v_max := 2;
  else
    if v_max is null or v_max not between 2 and 100 then raise exception 'A reunião comporta de 2 a 100 pessoas.'; end if;
  end if;
  select value ->> 'provider' into v_prov from public.platform_settings where key = 'video';
  insert into public.video_meetings (id, house_id, kind, title, starts_at, duration_min, max_participants, order_id, invitee_id, provider, room_name, created_by)
  values (v_id, p_house, p_kind, btrim(p_title), p_starts_at, p_duration_min, v_max, case when p_kind = 'consulta' then p_order end, v_invitee, coalesce(v_prov, 'daily'), 'ic-' || replace(gen_random_uuid()::text, '-', ''), v_uid);
  return v_id;
end $$;

create or replace function public.video_cancel(p_meeting uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings;
begin
  select * into m from public.video_meetings where id = p_meeting;
  if not found or auth.uid() is null or not public.is_house_owner(m.house_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'Esta reunião já foi encerrada ou cancelada.'; end if;
  update public.video_meetings set status = 'cancelada', ended_at = now() where id = p_meeting;
end $$;

-- Próximas reuniões que a pessoa pode ver (dono; membro ativo da casa; cliente convidado para consulta). Sem o nome da sala.
create or replace function public.video_my_upcoming() returns table (id uuid, house_id uuid, house_name text, kind text, title text, starts_at timestamptz, duration_min int, is_host boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.house_id, h.name, m.kind, m.title, m.starts_at, m.duration_min, (h.owner_id = auth.uid())
  from public.video_meetings m join public.houses h on h.id = m.house_id
  where auth.uid() is not null and m.status = 'agendada'
    and m.starts_at + make_interval(mins => m.duration_min + 10) >= now() and m.starts_at <= now() + interval '60 days'
    and (h.owner_id = auth.uid()
      or (m.kind = 'reuniao' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = auth.uid() and hm.left_at is null))
      or (m.kind = 'consulta' and m.invitee_id = auth.uid()))
  order by m.starts_at limit 100
$$;

-- Conferência de entrada: a função de borda chama isto com o login da pessoa antes de pedir o token ao provedor.
create or replace function public.video_join_check(p_meeting uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m public.video_meetings; h record; v_host boolean; v_ok boolean := false; v_live int; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'sem_login'); end if;
  select * into m from public.video_meetings where id = p_meeting;
  if not found or m.status <> 'agendada' then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  select owner_id, name into h from public.houses where id = m.house_id;
  v_host := h.owner_id = v_uid;
  v_ok := v_host
    or (m.kind = 'reuniao' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = v_uid and hm.left_at is null))
    or (m.kind = 'consulta' and m.invitee_id = v_uid);
  if not v_ok then return jsonb_build_object('ok', false, 'reason', 'sem_acesso'); end if;
  if not public.video_enabled_for(m.house_id) then return jsonb_build_object('ok', false, 'reason', 'desligado'); end if;
  if now() < m.starts_at - interval '10 minutes' then return jsonb_build_object('ok', false, 'reason', 'cedo', 'starts_at', m.starts_at); end if;
  if now() > m.starts_at + make_interval(mins => m.duration_min + 10) then return jsonb_build_object('ok', false, 'reason', 'encerrada'); end if;
  if (public.video_bank_of(m.house_id) ->> 'remaining')::int <= 0 then return jsonb_build_object('ok', false, 'reason', 'sem_minutos'); end if;
  select count(*) into v_live from public.video_usage u where u.meeting_id = m.id and u.left_at is null and u.user_id is distinct from v_uid;
  if v_live >= m.max_participants then return jsonb_build_object('ok', false, 'reason', 'lotada'); end if;
  select coalesce(nullif(btrim(display_name), ''), 'Participante') into v_name from public.profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'room_name', m.room_name, 'provider', m.provider, 'is_host', v_host, 'display_name', left(coalesce(v_name, 'Participante'), 40),
    'user_id', v_uid, 'kind', m.kind, 'title', m.title, 'ends_at', m.starts_at + make_interval(mins => m.duration_min));
end $$;

-- Consumo: só a função de borda (chave de serviço) grava. Idempotente por reunião + sessão; limita cada sessão ao tempo da reunião (+15 min).
create or replace function public.video_record_usage(p_room text, p_session text, p_user uuid, p_joined timestamptz, p_left timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings; v_min int := 0; v_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor registra consumo.' using errcode = '42501'; end if;
  select * into m from public.video_meetings where room_name = p_room;
  if not found or p_session is null or p_joined is null then return; end if;
  if p_left is not null and p_left >= p_joined then
    v_min := least(ceil(extract(epoch from (p_left - p_joined)) / 60)::int, m.duration_min + 15);
  end if;
  insert into public.video_usage (meeting_id, house_id, session_id, user_id, joined_at, left_at, minutes)
  values (m.id, m.house_id, left(p_session, 100), p_user, p_joined, p_left, v_min)
  on conflict (meeting_id, session_id) do update set left_at = coalesce(excluded.left_at, public.video_usage.left_at), minutes = greatest(public.video_usage.minutes, excluded.minutes),
    user_id = coalesce(public.video_usage.user_id, excluded.user_id);
end $$;

create or replace function public.video_close_room(p_room text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor encerra salas.' using errcode = '42501'; end if;
  update public.video_meetings set status = 'encerrada', ended_at = coalesce(ended_at, now()) where room_name = p_room and status = 'agendada';
  -- sessões sem saída registrada contam até o fim marcado da reunião (nunca além)
  update public.video_usage u set left_at = least(now(), m.starts_at + make_interval(mins => m.duration_min + 15)),
    minutes = greatest(u.minutes, least(ceil(extract(epoch from (least(now(), m.starts_at + make_interval(mins => m.duration_min + 15)) - u.joined_at)) / 60)::int, m.duration_min + 15))
  from public.video_meetings m where m.id = u.meeting_id and m.room_name = p_room and u.left_at is null;
end $$;

-- Permissões: quem é logado usa as funções da pessoa; as de consumo só o servidor.
revoke all on function public.video_config_ok(jsonb), public.video_enabled_for(uuid), public.video_month_start(), public.video_bank_of(uuid),
  public.video_bank(uuid), public.video_schedule(uuid, text, text, timestamptz, int, int, uuid), public.video_cancel(uuid), public.video_my_upcoming(),
  public.video_join_check(uuid), public.video_record_usage(text, text, uuid, timestamptz, timestamptz), public.video_close_room(text) from public, anon, authenticated;
grant execute on function public.video_bank(uuid), public.video_schedule(uuid, text, text, timestamptz, int, int, uuid), public.video_cancel(uuid),
  public.video_my_upcoming(), public.video_join_check(uuid) to authenticated;
grant execute on function public.video_record_usage(text, text, uuid, timestamptz, timestamptz), public.video_close_room(text) to service_role;

-- ============ 3) limpeza: reuniões antigas sem encerramento e consumo com mais de 12 meses ============
select cron.schedule('video-close-stale', '23 4 * * *', $c$update public.video_meetings set status = 'encerrada', ended_at = coalesce(ended_at, now()) where status = 'agendada' and starts_at + make_interval(mins => duration_min + 180) < now()$c$);
select cron.schedule('purge-video-usage', '53 3 * * *', $c$delete from public.video_usage where joined_at < now() - interval '12 months'$c$);
