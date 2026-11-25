-- Vídeo 2.0 (Fase 6): (1) atividades ao vivo vendidas como ingresso, (2) anfitriões/moderadores e sala de espera, (3) presença e histórico.
-- Regras decididas pelo dono: só o plano Plus tem vídeo (video_enabled_for já exige minutos no plano); o preço do ingresso é da casa e a comissão é a do ritual
-- (as atividades ao vivo SÃO rituais à distância: vagas, Stripe, comissão, reembolso e termos continuam os do ritual); histórico de presença guardado 12 meses;
-- sala de espera obrigatória nas atividades públicas e opcional nas reuniões de membros.

-- ============ tabelas e colunas ============
alter table public.video_meetings drop constraint if exists video_meetings_kind_check;
alter table public.video_meetings add constraint video_meetings_kind_check check (kind in ('reuniao', 'consulta', 'atividade'));
alter table public.video_meetings add column if not exists waiting_room boolean not null default false;
alter table public.video_meetings add column if not exists event_id uuid references public.events (id) on delete cascade;
alter table public.video_meetings drop constraint if exists video_meetings_atividade_check;
alter table public.video_meetings add constraint video_meetings_atividade_check check (kind <> 'atividade' or (waiting_room and event_id is not null));
create unique index if not exists video_meetings_event_open_idx on public.video_meetings (event_id) where event_id is not null and status = 'agendada';

create table if not exists public.video_helpers (
  meeting_id uuid not null references public.video_meetings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('coanfitriao', 'moderador')),
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index if not exists video_helpers_user_idx on public.video_helpers (user_id);
alter table public.video_helpers enable row level security;
revoke all on public.video_helpers from public, anon, authenticated;

create table if not exists public.video_waiting (
  meeting_id uuid not null references public.video_meetings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'aguardando' check (status in ('aguardando', 'admitido', 'negado')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  primary key (meeting_id, user_id)
);
alter table public.video_waiting enable row level security;
revoke all on public.video_waiting from public, anon, authenticated;

-- ============ papéis ============
-- 'dono' (responsável da casa), 'coanfitriao' (admite, retira e encerra), 'moderador' (admite e retira); null = participante.
create or replace function public.video_role_of(p_meeting uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_user is null then null
    when exists (select 1 from public.video_meetings m join public.houses h on h.id = m.house_id where m.id = p_meeting and h.owner_id = p_user) then 'dono'
    else (select r.role from public.video_helpers r where r.meeting_id = p_meeting and r.user_id = p_user)
  end
$$;
revoke all on function public.video_role_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.video_role_of(uuid, uuid) to service_role;

-- Quem era esperado na reunião (base do relatório de presença).
create or replace function public.video_expected(p_meeting uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select x from (
    select hm.user_id x from public.video_meetings m join public.house_members hm on hm.house_id = m.house_id and hm.left_at is null and hm.user_id is not null
      join public.houses h on h.id = m.house_id
     where m.id = p_meeting and m.kind = 'reuniao' and m.invite_all and hm.user_id <> h.owner_id
    union
    select vi.user_id from public.video_meetings m join public.video_invites vi on vi.meeting_id = m.id where m.id = p_meeting and m.kind = 'reuniao' and not m.invite_all
    union
    select m.invitee_id from public.video_meetings m where m.id = p_meeting and m.kind = 'consulta' and m.invitee_id is not null
    union
    select r.user_id from public.video_meetings m join public.reservations r on r.event_id = m.event_id and r.status = 'confirmada' where m.id = p_meeting and m.kind = 'atividade'
  ) t where x is not null
$$;
revoke all on function public.video_expected(uuid) from public, anon, authenticated;
grant execute on function public.video_expected(uuid) to service_role;

-- ============ entrada (com papéis, atividade e sala de espera) ============
create or replace function public.video_join_check(p_meeting uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m public.video_meetings; h record; v_role text; v_ok boolean := false; v_live int; v_name text; v_wait text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'sem_login'); end if;
  select * into m from public.video_meetings where id = p_meeting;
  if not found or m.status <> 'agendada' then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  if m.kind = 'consulta' and not public.video_order_active(m.order_id) then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  if m.kind = 'atividade' and not exists (select 1 from public.events e where e.id = m.event_id and e.status in ('publicado', 'encerrado')) then return jsonb_build_object('ok', false, 'reason', 'indisponivel'); end if;
  select owner_id, name into h from public.houses where id = m.house_id;
  v_role := public.video_role_of(p_meeting, v_uid);
  v_ok := v_role is not null
    or (m.kind = 'reuniao' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = v_uid and hm.left_at is null) and (m.invite_all or exists (select 1 from public.video_invites vi where vi.meeting_id = m.id and vi.user_id = v_uid)))
    or (m.kind = 'consulta' and m.invitee_id = v_uid)
    or (m.kind = 'atividade' and exists (select 1 from public.reservations r where r.event_id = m.event_id and r.user_id = v_uid and r.status = 'confirmada'));
  if not v_ok then return jsonb_build_object('ok', false, 'reason', 'sem_acesso'); end if;
  if v_role is null and exists (select 1 from public.video_removed vr where vr.meeting_id = m.id and vr.user_id = v_uid) then return jsonb_build_object('ok', false, 'reason', 'removido'); end if;
  if not public.video_enabled_for(m.house_id) then return jsonb_build_object('ok', false, 'reason', 'desligado'); end if;
  if now() < m.starts_at - interval '10 minutes' then return jsonb_build_object('ok', false, 'reason', 'cedo', 'starts_at', m.starts_at); end if;
  if now() > m.starts_at + make_interval(mins => m.duration_min + 10) then return jsonb_build_object('ok', false, 'reason', 'encerrada'); end if;
  if (public.video_bank_of(m.house_id) ->> 'remaining')::int <= 0 then return jsonb_build_object('ok', false, 'reason', 'sem_minutos'); end if;
  select count(*) into v_live from public.video_usage u where u.meeting_id = m.id and u.left_at is null and u.user_id is distinct from v_uid;
  if v_live >= m.max_participants then return jsonb_build_object('ok', false, 'reason', 'lotada'); end if;
  -- sala de espera: só a equipe (dono e ajudantes) entra direto; os demais esperam a liberação
  if m.waiting_room and v_role is null then
    select w.status into v_wait from public.video_waiting w where w.meeting_id = m.id and w.user_id = v_uid;
    if v_wait is distinct from 'admitido' then
      return jsonb_build_object('ok', false, 'reason', case when v_wait = 'negado' then 'negado_espera' else 'espera' end, 'waiting_status', coalesce(v_wait, 'nenhum'));
    end if;
  end if;
  select coalesce(nullif(btrim(display_name), ''), 'Participante') into v_name from public.profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'room_name', m.room_name, 'provider', m.provider, 'is_host', v_role in ('dono', 'coanfitriao'), 'can_moderate', v_role is not null,
    'role', coalesce(v_role, 'participante'), 'display_name', left(coalesce(v_name, 'Participante'), 40),
    'user_id', v_uid, 'kind', m.kind, 'title', m.title, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'max_participants', m.max_participants,
    'ends_at', m.starts_at + make_interval(mins => m.duration_min));
end $$;

-- Pede para entrar: se só falta a liberação, a pessoa entra na fila (uma vez; quem foi negado continua negado).
create or replace function public.video_request_entry(p_meeting uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_uid uuid := auth.uid();
begin
  r := public.video_join_check(p_meeting);
  if r ->> 'reason' = 'espera' then
    insert into public.video_waiting (meeting_id, user_id, status) values (p_meeting, v_uid, 'aguardando') on conflict (meeting_id, user_id) do nothing;
    return jsonb_build_object('ok', false, 'reason', 'espera', 'waiting_status', 'aguardando');
  end if;
  return r;
end $$;

create or replace function public.video_waiting_list(p_meeting uuid) returns table (user_id uuid, name text, requested_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or public.video_role_of(p_meeting, auth.uid()) is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query select w.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Participante'), w.requested_at
    from public.video_waiting w join public.video_meetings m on m.id = w.meeting_id and m.status = 'agendada' left join public.profiles p on p.id = w.user_id
   where w.meeting_id = p_meeting and w.status = 'aguardando' order by w.requested_at limit 200;
end $$;

-- Admite ou nega, uma pessoa, várias ou todas as que esperam. Devolve quantas decisões foram gravadas.
create or replace function public.video_admit(p_meeting uuid, p_users uuid[], p_decision text, p_all boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int; m public.video_meetings; v_st text;
begin
  if v_uid is null or public.video_role_of(p_meeting, v_uid) is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_decision not in ('admitir', 'negar') then raise exception 'Decisão inválida.'; end if;
  select * into m from public.video_meetings where id = p_meeting;
  if m.status <> 'agendada' then raise exception 'A reunião já terminou.'; end if;
  v_st := case when p_decision = 'admitir' then 'admitido' else 'negado' end;
  update public.video_waiting w set status = v_st, decided_by = v_uid, decided_at = now()
   where w.meeting_id = p_meeting and ((p_all and w.status = 'aguardando') or (not p_all and w.user_id = any (coalesce(p_users, '{}'))));
  get diagnostics n = row_count;
  return n;
end $$;

-- ============ anfitriões e moderadores ============
create or replace function public.video_set_helper(p_meeting uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m public.video_meetings; v_label text;
begin
  select * into m from public.video_meetings where id = p_meeting for update;
  if not found or v_uid is null or not public.is_house_owner(m.house_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'Esta reunião já terminou.'; end if;
  if m.kind = 'consulta' then raise exception 'A consulta é só entre a casa e o cliente.'; end if;
  if p_user is null or p_user = v_uid then raise exception 'Escolha outra pessoa.'; end if;
  if p_role is null then delete from public.video_helpers where meeting_id = p_meeting and user_id = p_user; return; end if;
  if p_role not in ('coanfitriao', 'moderador') then raise exception 'Função inválida.'; end if;
  if not exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = p_user and hm.left_at is null) then raise exception 'Escolha um membro ativo da casa (com conta).'; end if;
  if not exists (select 1 from public.video_helpers where meeting_id = p_meeting and user_id = p_user) and (select count(*) from public.video_helpers where meeting_id = p_meeting) >= 10 then raise exception 'Até 10 ajudantes por reunião.'; end if;
  delete from public.video_removed where meeting_id = p_meeting and user_id = p_user;
  insert into public.video_helpers (meeting_id, user_id, role, added_by) values (p_meeting, p_user, p_role, v_uid)
    on conflict (meeting_id, user_id) do update set role = excluded.role, added_by = excluded.added_by, added_at = now();
  v_label := case when p_role = 'coanfitriao' then 'coanfitrião' else 'moderador' end;
  insert into public.notifications (user_id, text, href) values (p_user, 'Você foi indicado como ' || v_label || ' da reunião "' || m.title || '". Você poderá liberar a entrada e retirar pessoas da sala.', '/reunioes');
end $$;

create or replace function public.video_helpers_of(p_meeting uuid) returns table (user_id uuid, name text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or public.video_role_of(p_meeting, auth.uid()) is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query select r.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Membro'), r.role from public.video_helpers r left join public.profiles p on p.id = r.user_id where r.meeting_id = p_meeting order by r.added_at;
end $$;

-- Retirar alguém: dono ou qualquer ajudante; a equipe não é retirada por colega (primeiro tira-se a função).
create or replace function public.video_remove(p_meeting uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.video_meetings;
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into m from public.video_meetings where id = p_meeting;
  if not found or public.video_role_of(p_meeting, uid) is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'A reunião já terminou.'; end if;
  if p_user is null or p_user = uid then raise exception 'Escolha outra pessoa.'; end if;
  if public.video_role_of(p_meeting, p_user) is not null then raise exception 'Quem ajuda na sala não pode ser retirado. Tire a função primeiro.'; end if;
  if (select count(*) from public.video_removed where meeting_id = m.id) >= 200 then raise exception 'Limite de remoções desta reunião atingido.'; end if;
  insert into public.video_removed (meeting_id, user_id, removed_by) values (m.id, p_user, uid) on conflict do nothing;
  return jsonb_build_object('provider', m.provider, 'room_name', m.room_name);
end $$;

-- Encerrar: dono ou coanfitrião.
create or replace function public.video_end(p_meeting uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings;
begin
  select * into m from public.video_meetings where id = p_meeting for update;
  if not found or auth.uid() is null or coalesce(public.video_role_of(p_meeting, auth.uid()), '') not in ('dono', 'coanfitriao') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'Esta reunião já foi encerrada ou cancelada.'; end if;
  if now() < m.starts_at - interval '10 minutes' then raise exception 'A sala ainda não abriu. Para desistir da reunião, use Cancelar.'; end if;
  update public.video_meetings set status = 'encerrada', ended_at = now() where id = p_meeting;
  return jsonb_build_object('provider', m.provider, 'room_name', m.room_name, 'provider_ref', m.provider_ref);
end $$;

-- ============ marcar (agora com sala de espera opcional) ============
drop function if exists public.video_schedule(uuid, text, text, timestamptz, integer, integer, uuid, uuid[]);
create or replace function public.video_schedule(p_house uuid, p_kind text, p_title text, p_starts_at timestamptz, p_duration_min integer, p_max_participants integer default 50, p_order uuid default null, p_invitees uuid[] default null, p_waiting boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prov text; v_bank jsonb; v_invitee uuid; v_id uuid := gen_random_uuid(); v_max int := p_max_participants;
  v_all boolean := true; v_ids uuid[]; v_n int; v_house text; v_when text;
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
    select o.client_id into v_invitee from public.service_orders o where o.id = p_order and o.house_id = p_house and o.status in ('confirmado', 'em_andamento');
    if v_invitee is null then raise exception 'Escolha um pedido desta casa já pago e em andamento para a consulta.'; end if;
    v_max := 2;
  else
    if p_invitees is not null then
      select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_invitees) x where x is not null;
      v_n := coalesce(cardinality(v_ids), 0);
      if v_n = 0 then raise exception 'Escolha pelo menos uma pessoa para convidar.'; end if;
      if v_n > 99 then raise exception 'Escolha até 99 pessoas.'; end if;
      if (select count(*) from public.house_members hm where hm.house_id = p_house and hm.left_at is null and hm.user_id = any (v_ids) and hm.user_id <> v_uid) <> v_n then
        raise exception 'Convide só membros ativos da sua casa (com conta).';
      end if;
      v_all := false;
      v_max := greatest(2, v_n + 1);
    elsif v_max is null or v_max not between 2 and 100 then raise exception 'A reunião comporta de 2 a 100 pessoas.'; end if;
  end if;
  select value ->> 'provider' into v_prov from public.platform_settings where key = 'video';
  insert into public.video_meetings (id, house_id, kind, title, starts_at, duration_min, max_participants, order_id, invitee_id, provider, room_name, created_by, invite_all, waiting_room)
  values (v_id, p_house, p_kind, btrim(p_title), p_starts_at, p_duration_min, v_max, case when p_kind = 'consulta' then p_order end, v_invitee, coalesce(v_prov, 'daily'), 'ic-' || replace(gen_random_uuid()::text, '-', ''), v_uid, v_all, p_kind = 'reuniao' and coalesce(p_waiting, false));
  if p_kind = 'reuniao' and not v_all then
    insert into public.video_invites (meeting_id, user_id) select v_id, x from unnest(v_ids) x;
  end if;
  select name into v_house from public.houses where id = p_house;
  v_when := to_char(p_starts_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  if p_kind = 'consulta' then
    insert into public.notifications (user_id, text, href) values (v_invitee, 'Consulta por vídeo marcada por ' || coalesce(v_house, 'uma casa') || ' em ' || v_when || '. A sala abre 10 minutos antes.', '/reunioes');
  else
    insert into public.notifications (user_id, text, href)
      select hm.user_id, 'Você foi convidado para a reunião "' || btrim(p_title) || '" de ' || coalesce(v_house, 'uma casa') || ' em ' || v_when || '. A sala abre 10 minutos antes.', '/reunioes'
        from public.house_members hm
       where hm.house_id = p_house and hm.left_at is null and hm.user_id is not null and hm.user_id <> v_uid
         and (v_all or hm.user_id = any (v_ids));
  end if;
  return v_id;
end $$;
revoke execute on function public.video_schedule(uuid, text, text, timestamptz, integer, integer, uuid, uuid[], boolean) from public, anon;
grant execute on function public.video_schedule(uuid, text, text, timestamptz, integer, integer, uuid, uuid[], boolean) to authenticated, service_role;

-- ============ atividade ao vivo = ritual à distância com sala da plataforma ============
create or replace function public.video_schedule_activity(p_event uuid, p_duration_min integer default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); ev public.events; v_dur int; v_prov text; v_id uuid := gen_random_uuid();
begin
  select * into ev from public.events where id = p_event for update;
  if not found or v_uid is null or not public.is_house_owner(ev.house_id) then raise exception 'Só o responsável pela casa abre a sala de vídeo do ritual.' using errcode = '42501'; end if;
  if not public.video_enabled_for(ev.house_id) then raise exception 'O vídeo não está disponível para a sua casa ainda.'; end if;
  if ev.status <> 'publicado' then raise exception 'Publique o ritual antes de abrir a sala de vídeo.'; end if;
  if ev.mode::text not in ('distancia', 'hibrido') then raise exception 'A sala de vídeo é para rituais à distância ou híbridos.'; end if;
  if ev.starts_at < now() then raise exception 'O ritual já começou ou passou.'; end if;
  if ev.seats_total > 90 then raise exception 'A sala de vídeo da plataforma comporta rituais de até 90 vagas.'; end if;
  if exists (select 1 from public.video_meetings where event_id = p_event and status = 'agendada') then raise exception 'Este ritual já tem sala de vídeo.'; end if;
  v_dur := coalesce(p_duration_min, ev.duration_min::int, 60);
  if v_dur not between 5 and 90 then raise exception 'A duração vai de 5 a 90 minutos.'; end if;
  if (public.video_bank_of(ev.house_id) ->> 'remaining')::int <= 0 then raise exception 'Os minutos de vídeo deste mês acabaram.'; end if;
  select value ->> 'provider' into v_prov from public.platform_settings where key = 'video';
  insert into public.video_meetings (id, house_id, kind, title, starts_at, duration_min, max_participants, provider, room_name, created_by, invite_all, waiting_room, event_id)
  values (v_id, ev.house_id, 'atividade', left(btrim(ev.title), 80), ev.starts_at, v_dur, least(100, ev.seats_total + 10), coalesce(v_prov, 'daily'), 'ic-' || replace(gen_random_uuid()::text, '-', ''), v_uid, false, true, p_event);
  return v_id;
end $$;
revoke execute on function public.video_schedule_activity(uuid, integer) from public, anon;
grant execute on function public.video_schedule_activity(uuid, integer) to authenticated, service_role;

-- A sala acompanha o ritual: mudou horário, vagas ou título → a reunião segue; ritual cancelado → a sala é cancelada.
create or replace function public.events_sync_video() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    update public.video_meetings set status = 'cancelada', ended_at = now() where event_id = new.id and status = 'agendada';
  elsif new.starts_at is distinct from old.starts_at or new.seats_total is distinct from old.seats_total or new.title is distinct from old.title or new.duration_min is distinct from old.duration_min then
    update public.video_meetings set starts_at = case when new.starts_at > now() then new.starts_at else starts_at end,
      max_participants = least(100, new.seats_total + 10), title = left(btrim(new.title), 80),
      duration_min = case when new.duration_min between 5 and 90 then new.duration_min else duration_min end,
      reminded_at = case when new.starts_at is distinct from old.starts_at then null else reminded_at end
     where event_id = new.id and status = 'agendada' and now() < starts_at - interval '10 minutes';
  end if;
  return new;
end $$;
drop trigger if exists events_sync_video on public.events;
create trigger events_sync_video after update of starts_at, seats_total, title, duration_min, status on public.events for each row execute function public.events_sync_video();

-- ============ listas e lembretes ============
drop function if exists public.video_my_upcoming();
create function public.video_my_upcoming() returns table (id uuid, house_id uuid, house_name text, kind text, title text, starts_at timestamptz, duration_min integer, is_host boolean, role text, waiting_room boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.house_id, h.name, m.kind, m.title, m.starts_at, m.duration_min, (h.owner_id = auth.uid()), coalesce(public.video_role_of(m.id, auth.uid()), 'participante'), m.waiting_room
    from public.video_meetings m join public.houses h on h.id = m.house_id
   where auth.uid() is not null and m.status = 'agendada'
     and (m.kind in ('reuniao', 'atividade') or public.video_order_active(m.order_id))
     and m.starts_at + make_interval(mins => m.duration_min + 10) >= now() and m.starts_at <= now() + interval '60 days'
     and (public.video_role_of(m.id, auth.uid()) is not null
          or (m.kind = 'reuniao' and exists (select 1 from public.house_members hm where hm.house_id = m.house_id and hm.user_id = auth.uid() and hm.left_at is null) and (m.invite_all or exists (select 1 from public.video_invites vi where vi.meeting_id = m.id and vi.user_id = auth.uid())))
          or (m.kind = 'consulta' and m.invitee_id = auth.uid())
          or (m.kind = 'atividade' and exists (select 1 from public.reservations r where r.event_id = m.event_id and r.user_id = auth.uid() and r.status = 'confirmada')))
   order by m.starts_at limit 100
$$;
revoke execute on function public.video_my_upcoming() from public, anon;
grant execute on function public.video_my_upcoming() to authenticated, service_role;

create or replace function public.video_send_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; v_text text; v_hour text;
begin
  for r in
    update public.video_meetings m set reminded_at = now()
     where m.status = 'agendada' and m.reminded_at is null and m.starts_at - interval '10 minutes' <= now() and now() < m.starts_at + make_interval(mins => m.duration_min) and public.video_enabled_for(m.house_id)
    returning m.id, m.house_id, m.kind, m.title, m.starts_at, m.invite_all, m.invitee_id, m.event_id
  loop
    v_hour := to_char(r.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_text := case when r.kind = 'consulta' then 'Sua consulta por vídeo começa às ' else (case when r.kind = 'atividade' then 'A atividade "' else 'A reunião "' end) || r.title || '" começa às ' end || v_hour || '. A sala já está aberta.';
    if r.kind = 'consulta' then
      insert into public.notifications (user_id, text, href) values (r.invitee_id, v_text, '/reunioes/' || r.id);
    elsif r.kind = 'atividade' then
      insert into public.notifications (user_id, text, href) select rs.user_id, v_text, '/reunioes/' || r.id from public.reservations rs where rs.event_id = r.event_id and rs.status = 'confirmada';
    else
      insert into public.notifications (user_id, text, href)
        select hm.user_id, v_text, '/reunioes/' || r.id from public.house_members hm join public.houses h on h.id = hm.house_id
         where hm.house_id = r.house_id and hm.left_at is null and hm.user_id is not null and hm.user_id <> h.owner_id and (r.invite_all or exists (select 1 from public.video_invites vi where vi.meeting_id = r.id and vi.user_id = hm.user_id));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ presença e histórico (guardados 12 meses; ver purge-video-usage e purge-video-meetings) ============
create or replace function public.video_presence(p_meeting uuid) returns table (user_id uuid, name text, role text, expected boolean, first_in timestamptz, last_out timestamptz, minutes integer, sessions integer, removed boolean, waited text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(public.video_role_of(p_meeting, auth.uid()), '') not in ('dono', 'coanfitriao') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
  with u as (
    select x.user_id, min(x.joined_at) fi, case when bool_or(x.left_at is null) then null else max(x.left_at) end lo, sum(x.minutes)::int mi, count(*)::int se
      from public.video_usage x where x.meeting_id = p_meeting and x.user_id is not null group by x.user_id
  ), ids as (
    select e as uid from public.video_expected(p_meeting) e
    union select u.user_id from u
    union select r.user_id from public.video_helpers r where r.meeting_id = p_meeting
  )
  select ids.uid, coalesce(nullif(btrim(p.display_name), ''), 'Participante'), coalesce(public.video_role_of(p_meeting, ids.uid), 'participante'),
         exists (select 1 from public.video_expected(p_meeting) e2 where e2 = ids.uid), u.fi, u.lo, coalesce(u.mi, 0), coalesce(u.se, 0),
         exists (select 1 from public.video_removed vr where vr.meeting_id = p_meeting and vr.user_id = ids.uid),
         (select w.status from public.video_waiting w where w.meeting_id = p_meeting and w.user_id = ids.uid)
    from ids left join u on u.user_id = ids.uid left join public.profiles p on p.id = ids.uid
   order by (u.fi is null), u.fi, 2 limit 500;
end $$;

create or replace function public.video_history(p_house uuid) returns table (id uuid, title text, kind text, starts_at timestamptz, duration_min integer, status text, expected integer, present integer, minutes integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_house_owner(p_house) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  return query
  select m.id, m.title, m.kind, m.starts_at, m.duration_min, m.status,
         (select count(*)::int from public.video_expected(m.id)),
         (select count(distinct x.user_id)::int from public.video_usage x where x.meeting_id = m.id and x.user_id is not null),
         coalesce((select sum(x.minutes)::int from public.video_usage x where x.meeting_id = m.id), 0)
    from public.video_meetings m
   where m.house_id = p_house and m.status <> 'cancelada' and m.starts_at < now() and m.starts_at > now() - interval '12 months'
   order by m.starts_at desc limit 100;
end $$;

revoke execute on function public.video_request_entry(uuid), public.video_waiting_list(uuid), public.video_admit(uuid, uuid[], text, boolean), public.video_set_helper(uuid, uuid, text),
  public.video_helpers_of(uuid), public.video_presence(uuid), public.video_history(uuid) from public, anon;
grant execute on function public.video_request_entry(uuid), public.video_waiting_list(uuid), public.video_admit(uuid, uuid[], text, boolean), public.video_set_helper(uuid, uuid, text),
  public.video_helpers_of(uuid), public.video_presence(uuid), public.video_history(uuid) to authenticated, service_role;
revoke execute on function public.video_join_check(uuid), public.video_remove(uuid, uuid), public.video_end(uuid) from public, anon;
grant execute on function public.video_join_check(uuid), public.video_remove(uuid, uuid), public.video_end(uuid) to authenticated, service_role;
revoke execute on function public.events_sync_video() from public, anon, authenticated;

-- Retenção: o histórico de presença (video_usage) já sai com 12 meses; as atividades passam a sair junto com as reuniões (12 meses).
select cron.unschedule('purge-video-meetings') where exists (select 1 from cron.job where jobname = 'purge-video-meetings');
select cron.schedule('purge-video-meetings', '17 4 * * *', $c$delete from public.video_meetings where (kind in ('reuniao', 'atividade') and starts_at < now() - interval '12 months') or (kind = 'consulta' and starts_at < now() - interval '5 years')$c$);
