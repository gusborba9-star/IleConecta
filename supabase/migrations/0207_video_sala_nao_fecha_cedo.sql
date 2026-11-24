-- 0207 — Vídeo: a reunião não é dada como encerrada só porque todo mundo saiu (24/11/2026).
-- O aviso "meeting.ended" do Daily chega quando a última pessoa sai, mesmo antes do horário previsto (queda de rede, saiu e voltou, anfitrião
-- saiu antes do cliente). Antes, isso marcava a reunião como encerrada e ninguém conseguia voltar à sala. Agora o consumo é fechado do mesmo
-- jeito, mas a reunião só vira "encerrada" quando passa do horário previsto; antes disso as pessoas podem voltar (a janela da sala e a
-- rotina que fecha sessões esquecidas continuam valendo). Nada muda no cálculo dos minutos.
create or replace function public.video_close_room(p_room text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Só o servidor encerra salas.' using errcode = '42501'; end if;
  update public.video_meetings set status = 'encerrada', ended_at = coalesce(ended_at, now())
   where (room_name = p_room or provider_ref = p_room) and status = 'agendada' and now() >= starts_at + make_interval(mins => duration_min);
  update public.video_usage u set left_at = least(now(), m.starts_at + make_interval(mins => m.duration_min + 15)),
    minutes = greatest(u.minutes, least(ceil(extract(epoch from (least(now(), m.starts_at + make_interval(mins => m.duration_min + 15)) - u.joined_at)) / 60)::int, m.duration_min + 15))
  from public.video_meetings m where m.id = u.meeting_id and (m.room_name = p_room or m.provider_ref = p_room) and u.left_at is null;
end $$;
