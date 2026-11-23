-- 0180 — Vídeo, peça 3: guardar a sala criada no provedor e aceitar o código da sala de qualquer provedor (22/11/2026).
-- A função de borda cria a sala no Daily ou no Whereby só na primeira entrada; o endereço da sala fica aqui (tabela fechada, só o servidor lê).
-- Daily identifica a sala pelo nome (room_name); Whereby, pelo código da reunião (provider_ref): o consumo e o encerramento aceitam os dois.
-- Primeira gravação vence: duas pessoas entrando ao mesmo tempo não criam duas salas diferentes para a mesma reunião.

alter table public.video_meetings add column if not exists provider_ref text;
alter table public.video_meetings add column if not exists provider_url text;
alter table public.video_meetings add column if not exists provider_host_url text;
create unique index if not exists video_meetings_provider_ref_idx on public.video_meetings (provider, provider_ref) where provider_ref is not null;

create or replace function public.video_room_get(p_meeting uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.video_meetings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor lê a sala.' using errcode = '42501'; end if;
  select * into m from public.video_meetings where id = p_meeting;
  if not found then return null; end if;
  return jsonb_build_object('ref', m.provider_ref, 'url', m.provider_url, 'host_url', m.provider_host_url);
end $$;

create or replace function public.video_set_room(p_meeting uuid, p_ref text, p_url text, p_host_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor grava a sala.' using errcode = '42501'; end if;
  if p_ref is null or char_length(p_ref) > 200 or (p_url is not null and char_length(p_url) > 500) or (p_host_url is not null and char_length(p_host_url) > 600) then raise exception 'Sala inválida.'; end if;
  update public.video_meetings set provider_ref = coalesce(provider_ref, p_ref), provider_url = coalesce(provider_url, p_url), provider_host_url = coalesce(provider_host_url, p_host_url)
  where id = p_meeting returning * into m;
  if not found then return null; end if;
  return jsonb_build_object('ref', m.provider_ref, 'url', m.provider_url, 'host_url', m.provider_host_url);
end $$;

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
    'user_id', v_uid, 'kind', m.kind, 'title', m.title, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'max_participants', m.max_participants,
    'ends_at', m.starts_at + make_interval(mins => m.duration_min));
end $$;

create or replace function public.video_record_usage(p_room text, p_session text, p_user uuid, p_joined timestamptz, p_left timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings; v_min int := 0; v_end timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor registra consumo.' using errcode = '42501'; end if;
  select * into m from public.video_meetings where room_name = p_room or provider_ref = p_room order by (room_name = p_room) desc limit 1;
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
  update public.video_meetings set status = 'encerrada', ended_at = coalesce(ended_at, now()) where (room_name = p_room or provider_ref = p_room) and status = 'agendada';
  -- sessões sem saída registrada contam até o fim marcado da reunião (nunca além)
  update public.video_usage u set left_at = least(now(), m.starts_at + make_interval(mins => m.duration_min + 15)),
    minutes = greatest(u.minutes, least(ceil(extract(epoch from (least(now(), m.starts_at + make_interval(mins => m.duration_min + 15)) - u.joined_at)) / 60)::int, m.duration_min + 15))
  from public.video_meetings m where m.id = u.meeting_id and (m.room_name = p_room or m.provider_ref = p_room) and u.left_at is null;
end $$;

revoke all on function public.video_room_get(uuid), public.video_set_room(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.video_room_get(uuid), public.video_set_room(uuid, text, text, text) to service_role;
revoke all on function public.video_join_check(uuid) from public, anon;
grant execute on function public.video_join_check(uuid) to authenticated;
revoke all on function public.video_record_usage(text, text, uuid, timestamptz, timestamptz), public.video_close_room(text) from public, anon, authenticated;
grant execute on function public.video_record_usage(text, text, uuid, timestamptz, timestamptz), public.video_close_room(text) to service_role;
