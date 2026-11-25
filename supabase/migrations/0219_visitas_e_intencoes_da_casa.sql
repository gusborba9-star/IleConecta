-- 0219 — Visitas, alcance e intenções da casa (Blueprint §28.1, itens "ainda sem registro"; decisão do proprietário, 24/11/2026).
-- DESLIGADO por padrão (features.house_signals.state = 'on' no painel) até a Política de Privacidade ser revisada.
-- O que se guarda: totais por casa, dia e tipo (visitas e pessoas distintas). NUNCA quem visitou: a pessoa vira uma chave HMAC que
-- muda todo dia e é específica da casa (não dá para seguir alguém de uma casa para outra nem de um dia para o outro); essas chaves
-- só servem para não contar a mesma pessoa duas vezes e são apagadas ao fim do próprio dia (horário de Brasília).
-- Totais diários: retenção de 13 meses (mesma regra do funil atribuído, 0174). Não entram: a titular, a equipe da casa e quem não deixa registrar.
-- Tipos: visita (página da casa), oferta (abriu um serviço ou ritual), compartilhar (copiou/enviou o link ou o QR da casa).
-- Seguidores, conversas, pedidos e pagamentos já têm indicador próprio (0132) e não são repetidos aqui.

create table if not exists public.house_signal_seen (
  house_id uuid not null references public.houses(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('visita', 'oferta', 'compartilhar')),
  vkey text not null,
  n integer not null default 1,
  primary key (house_id, day, kind, vkey)
);
create table if not exists public.house_signal_daily (
  house_id uuid not null references public.houses(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('visita', 'oferta', 'compartilhar')),
  events integer not null default 0,
  people integer not null default 0,
  primary key (house_id, day, kind)
);
alter table public.house_signal_seen enable row level security;
alter table public.house_signal_daily enable row level security;
revoke all on public.house_signal_seen, public.house_signal_daily from public, anon, authenticated;
insert into public.app_secrets (key, value) values ('signal_hmac', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;

create or replace function public.house_signals_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value -> 'house_signals' ->> 'state' = 'on' from public.platform_settings where key = 'features'), false);
$$;
revoke all on function public.house_signals_on() from public, anon, authenticated;

-- Registra um sinal. Nunca levanta erro para o visitante: qualquer dúvida devolve false e a página segue normalmente.
-- p_client: código aleatório do aparelho (muda todo dia); quem está logado usa o próprio id. Máximo de 20 repetições por pessoa, dia e tipo.
create or replace function public.track_house_signal(p_owner uuid, p_kind text, p_client text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); h public.houses%rowtype; v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_sec text; v_key text; v_new boolean; v_n integer;
begin
  if not public.house_signals_on() or p_kind not in ('visita', 'oferta', 'compartilhar') or p_owner is null then return false; end if;
  select * into h from public.houses where owner_id = p_owner;
  if not found then return false; end if;
  if v_uid is not null and (v_uid = h.owner_id or exists (select 1 from public.staff_row() s where s.house_id = h.id)) then return false; end if;
  if v_uid is null and (p_client is null or char_length(p_client) not between 12 and 64) then return false; end if;
  select value into v_sec from public.app_secrets where key = 'signal_hmac';
  if v_sec is null then return false; end if;
  v_key := encode(extensions.hmac(v_day::text || '|' || h.id::text || '|' || coalesce(v_uid::text, p_client), v_sec, 'sha256'), 'hex');
  -- teto de chaves por casa e dia (impede encher a tabela com códigos inventados)
  if not exists (select 1 from public.house_signal_seen where house_id = h.id and day = v_day and kind = p_kind and vkey = v_key)
     and (select count(*) from public.house_signal_seen where house_id = h.id and day = v_day) >= 20000 then return false; end if;
  insert into public.house_signal_seen (house_id, day, kind, vkey) values (h.id, v_day, p_kind, v_key)
  on conflict (house_id, day, kind, vkey) do update set n = house_signal_seen.n + 1 where house_signal_seen.n < 20
  returning (xmax = 0), n into v_new, v_n;
  if v_n is null then return false; end if;
  insert into public.house_signal_daily (house_id, day, kind, events, people) values (h.id, v_day, p_kind, 1, case when v_new then 1 else 0 end)
  on conflict (house_id, day, kind) do update set events = house_signal_daily.events + 1, people = house_signal_daily.people + case when v_new then 1 else 0 end;
  return true;
exception when others then return false;
end $$;
revoke all on function public.track_house_signal(uuid, text, text) from public;
grant execute on function public.track_house_signal(uuid, text, text) to anon, authenticated;

-- Leitura da casa (titular, ou equipe com a permissão de indicadores), mesma janela e comparação de house_indicators.
create or replace function public.house_signals(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_house uuid; v_perms text[] := '{}';
  v_days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date; k text; r jsonb := '{}'::jsonb;
  c_from date; p_from date;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select h.id into v_house from public.houses h where h.owner_id = v_uid order by h.created_at limit 1;
  if v_house is null then
    select s.house_id, s.perms into v_house, v_perms from public.staff_row() s limit 1;
    if v_house is null then raise exception 'not_house' using errcode = '42501'; end if;
    if not ('stats' = any (v_perms)) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  end if;
  if not public.house_signals_on() then return jsonb_build_object('enabled', false, 'days', v_days); end if;
  c_from := v_today - (v_days - 1); p_from := c_from - v_days;
  foreach k in array array['visita', 'oferta', 'compartilhar'] loop
    r := r || jsonb_build_object(k, jsonb_build_object(
      'current', jsonb_build_object('events', coalesce((select sum(events) from public.house_signal_daily where house_id = v_house and kind = k and day >= c_from and day <= v_today), 0),
                                    'people', coalesce((select sum(people) from public.house_signal_daily where house_id = v_house and kind = k and day >= c_from and day <= v_today), 0)),
      'previous', jsonb_build_object('events', coalesce((select sum(events) from public.house_signal_daily where house_id = v_house and kind = k and day >= p_from and day < c_from), 0),
                                     'people', coalesce((select sum(people) from public.house_signal_daily where house_id = v_house and kind = k and day >= p_from and day < c_from), 0))));
  end loop;
  return jsonb_build_object('enabled', true, 'days', v_days, 'signals', r);
end $$;
revoke all on function public.house_signals(integer) from public, anon;
grant execute on function public.house_signals(integer) to authenticated;

-- Limpeza: as chaves do dia somem ao fim do dia (de hora em hora); os totais ficam 13 meses.
select cron.schedule('house-signals-clean', '7 * * * *', $c$delete from public.house_signal_seen where day < (now() at time zone 'America/Sao_Paulo')::date; delete from public.house_signal_daily where day < (now() at time zone 'America/Sao_Paulo')::date - 400$c$);
