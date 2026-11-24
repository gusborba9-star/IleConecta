-- Vídeo: a LiveKit não tem validade de sala (o Daily tinha). Sem isto, quem já está dentro ficaria depois do horário-limite
-- (fim previsto + 15 min). Uma rotina a cada 5 minutos pede à função "video" para fechar essas salas. Os minutos já tinham teto no banco.
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'video_cron_secret', 'Rotina que fecha salas de vídeo vencidas (função video, ação sweep)')
where not exists (select 1 from vault.secrets where name = 'video_cron_secret');

create or replace function public.video_cron_ok(p_secret text) returns boolean
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor.' using errcode = '42501'; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'video_cron_secret';
  return s is not null and p_secret is not null and length(p_secret) > 20 and p_secret = s;
end $$;

-- Salas já vencidas (até 6 horas atrás) de provedores sem validade de sala; fechar de novo uma sala já fechada é inofensivo.
create or replace function public.video_rooms_to_close() returns table (room_name text, provider text)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor.' using errcode = '42501'; end if;
  return query
    select m.room_name, m.provider from public.video_meetings m
     where m.provider = 'livekit' and m.status <> 'cancelada'
       and m.starts_at + make_interval(mins => m.duration_min + 15) < now()
       and m.starts_at + make_interval(mins => m.duration_min + 15) > now() - interval '6 hours'
       and exists (select 1 from public.video_usage u where u.meeting_id = m.id and u.left_at is null);
end $$;

revoke all on function public.video_cron_ok(text), public.video_rooms_to_close() from public, anon, authenticated;
grant execute on function public.video_cron_ok(text), public.video_rooms_to_close() to service_role;

select cron.schedule('video-sweep', '*/5 * * * *', $cron$select net.http_post(url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/video', headers := jsonb_build_object('Content-Type', 'application/json', 'x-video-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'video_cron_secret'), '')), body := '{"action":"sweep"}'::jsonb)$cron$);
