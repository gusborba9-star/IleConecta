-- Vídeo: a dona da casa pode encerrar a reunião em andamento (a sala fecha para todos) e já não pode "cancelar" uma sala aberta.
-- video_end: só a dona da casa; só reunião agendada cuja sala já abriu; marca como encerrada e devolve o que a função precisa para fechar a sala no provedor.
create or replace function public.video_end(p_meeting uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings;
begin
  select * into m from public.video_meetings where id = p_meeting for update;
  if not found or auth.uid() is null or not public.is_house_owner(m.house_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'Esta reunião já foi encerrada ou cancelada.'; end if;
  if now() < m.starts_at - interval '10 minutes' then raise exception 'A sala ainda não abriu. Para desistir da reunião, use Cancelar.'; end if;
  update public.video_meetings set status = 'encerrada', ended_at = now() where id = p_meeting;
  return jsonb_build_object('provider', m.provider, 'room_name', m.room_name, 'provider_ref', m.provider_ref);
end $$;

-- Cancelar só antes de a sala abrir; depois disso, encerrar (que também fecha a sala no provedor).
create or replace function public.video_cancel(p_meeting uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.video_meetings;
begin
  select * into m from public.video_meetings where id = p_meeting;
  if not found or auth.uid() is null or not public.is_house_owner(m.house_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if m.status <> 'agendada' then raise exception 'Esta reunião já foi encerrada ou cancelada.'; end if;
  if now() >= m.starts_at - interval '10 minutes' then raise exception 'A sala já abriu. Use Encerrar reunião.'; end if;
  update public.video_meetings set status = 'cancelada', ended_at = now() where id = p_meeting;
end $$;

revoke execute on function public.video_end(uuid) from public, anon;
grant execute on function public.video_end(uuid) to authenticated;
