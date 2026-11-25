-- Vídeo: lembrete no sino quando a sala abre (10 minutos antes do horário). Uma vez por reunião (reminded_at), só para quem pode entrar:
-- todos os membros ativos (reunião "para todos"), os convidados escolhidos, ou o cliente da consulta. O aviso leva direto à sala.
alter table public.video_meetings add column if not exists reminded_at timestamptz;

create or replace function public.video_send_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; v_text text; v_hour text;
begin
  for r in
    update public.video_meetings m set reminded_at = now()
     where m.status = 'agendada' and m.reminded_at is null
       and m.starts_at - interval '10 minutes' <= now() and now() < m.starts_at + make_interval(mins => m.duration_min)
       and public.video_enabled_for(m.house_id)
     returning m.id, m.house_id, m.kind, m.title, m.starts_at, m.invite_all, m.invitee_id
  loop
    v_hour := to_char(r.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_text := case when r.kind = 'consulta' then 'Sua consulta por vídeo começa às ' else 'A reunião "' || r.title || '" começa às ' end || v_hour || '. A sala já está aberta.';
    if r.kind = 'consulta' then
      insert into public.notifications (user_id, text, href) values (r.invitee_id, v_text, '/reunioes/' || r.id);
      n := n + 1;
    else
      insert into public.notifications (user_id, text, href)
        select hm.user_id, v_text, '/reunioes/' || r.id
          from public.house_members hm join public.houses h on h.id = hm.house_id
         where hm.house_id = r.house_id and hm.left_at is null and hm.user_id is not null and hm.user_id <> h.owner_id
           and (r.invite_all or exists (select 1 from public.video_invites vi where vi.meeting_id = r.id and vi.user_id = hm.user_id));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.video_send_reminders() from public, anon, authenticated;
grant execute on function public.video_send_reminders() to service_role;

select cron.schedule('video-lembrete', '* * * * *', $c$select public.video_send_reminders()$c$);
