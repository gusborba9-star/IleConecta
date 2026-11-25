-- A sala de vídeo aberta de um ritual: a casa (para gerir) e quem tem vaga confirmada (para entrar) a encontram pelo ritual.
create or replace function public.video_activity_of(p_event uuid) returns table (id uuid, starts_at timestamptz, duration_min integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.starts_at, m.duration_min
    from public.video_meetings m join public.events e on e.id = m.event_id
   where m.event_id = p_event and m.status = 'agendada' and auth.uid() is not null
     and (public.is_house_owner(e.house_id) or exists (select 1 from public.reservations r where r.event_id = p_event and r.user_id = auth.uid() and r.status = 'confirmada'))
   limit 1
$$;
revoke execute on function public.video_activity_of(uuid) from public, anon;
grant execute on function public.video_activity_of(uuid) to authenticated, service_role;
