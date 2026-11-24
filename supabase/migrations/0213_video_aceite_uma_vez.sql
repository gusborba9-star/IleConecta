-- Vídeo: o aceite do aviso vale para a reunião inteira (sair e voltar à mesma chamada não pede de novo).
-- A tela pergunta ao banco se a própria pessoa já aceitou esta reunião na versão atual dos textos; reunião nova ou texto novo pedem de novo.
create or replace function public.video_acked(p_meeting uuid, p_version text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.video_acks a
     where a.meeting_id = p_meeting and a.user_id = auth.uid() and a.version = left(coalesce(nullif(btrim(p_version), ''), 'sem-versao'), 60));
$$;
revoke execute on function public.video_acked(uuid, text) from public, anon;
grant execute on function public.video_acked(uuid, text) to authenticated;
