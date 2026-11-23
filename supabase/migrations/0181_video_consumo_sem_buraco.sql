-- 0181 — Vídeo, peça 3b: nenhum minuto fica sem contar (22/11/2026).
-- 1) video_record_usage aceita o aviso de SAÍDA sem a hora de entrada (o Whereby só informa quem saiu): usa a entrada já gravada.
-- 2) video_finalize_stale(): a cada 15 minutos fecha as sessões sem saída registrada (aba fechada, queda de rede, aviso perdido) contando
--    até o fim previsto da reunião + 15 min (nunca além) e encerra reuniões esquecidas. Antes só encerrava a cada dia e sem fechar as sessões.

create or replace function public.video_record_usage(p_room text, p_session text, p_user uuid, p_joined timestamptz default null, p_left timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings; v_min int := 0; v_in timestamptz; v_old timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor registra consumo.' using errcode = '42501'; end if;
  select * into m from public.video_meetings where room_name = p_room or provider_ref = p_room order by (room_name = p_room) desc limit 1;
  if not found or p_session is null or (p_joined is null and p_left is null) then return; end if;
  select joined_at into v_old from public.video_usage where meeting_id = m.id and session_id = left(p_session, 100);
  v_in := coalesce(p_joined, v_old, p_left);
  if p_left is not null and p_left >= v_in then
    v_min := least(ceil(extract(epoch from (p_left - v_in)) / 60)::int, m.duration_min + 15);
  end if;
  insert into public.video_usage (meeting_id, house_id, session_id, user_id, joined_at, left_at, minutes)
  values (m.id, m.house_id, left(p_session, 100), p_user, v_in, p_left, v_min)
  on conflict (meeting_id, session_id) do update set left_at = coalesce(excluded.left_at, public.video_usage.left_at), minutes = greatest(public.video_usage.minutes, excluded.minutes),
    user_id = coalesce(public.video_usage.user_id, excluded.user_id);
end $$;

create or replace function public.video_finalize_stale() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.video_usage u set left_at = m.starts_at + make_interval(mins => m.duration_min + 15),
    minutes = greatest(u.minutes, least(ceil(extract(epoch from (m.starts_at + make_interval(mins => m.duration_min + 15) - u.joined_at)) / 60)::int, m.duration_min + 15))
  from public.video_meetings m
  where m.id = u.meeting_id and u.left_at is null and m.starts_at + make_interval(mins => m.duration_min + 15) < now() and u.joined_at < m.starts_at + make_interval(mins => m.duration_min + 15);
  get diagnostics n = row_count;
  update public.video_meetings set status = 'encerrada', ended_at = coalesce(ended_at, now())
  where status = 'agendada' and starts_at + make_interval(mins => duration_min + 180) < now();
  return n;
end $$;

revoke all on function public.video_finalize_stale() from public, anon, authenticated;
revoke all on function public.video_record_usage(text, text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.video_record_usage(text, text, uuid, timestamptz, timestamptz) to service_role;

select cron.schedule('video-close-stale', '*/15 * * * *', $c$select public.video_finalize_stale()$c$);
