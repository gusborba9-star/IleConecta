-- Assumir / devolver à assistente só vale numa conversa da casa com um CLIENTE.
-- Antes, qualquer dona de casa que fosse membro da conversa podia agir, inclusive numa conversa entre duas casas
-- (a outra casa via "Assistente ativa / Assumir" no chat da casa alheia).
create or replace function public.handoff_actor(p_conv uuid, out o_owner uuid, out o_name text)
language plpgsql stable security definer set search_path = public as $$
declare s public.house_staff;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if exists (select 1 from public.houses h join public.conversation_members cm on cm.user_id = h.owner_id
             where h.owner_id = auth.uid() and cm.conversation_id = p_conv) then
    if exists (select 1 from public.conversation_members cm2 join public.houses h2 on h2.owner_id = cm2.user_id
               where cm2.conversation_id = p_conv and cm2.user_id <> auth.uid()) then
      raise exception 'Conversa indisponível.' using errcode = '42501';
    end if;
    o_owner := auth.uid(); o_name := null; return;
  end if;
  if public.staff_perm('chat_reply') is not null and public.staff_can_see_conversation(p_conv) then
    select * into s from public.staff_row();
    select h.owner_id into o_owner from public.houses h where h.id = s.house_id;
    o_name := s.name; return;
  end if;
  raise exception 'Conversa indisponível.' using errcode = '42501';
end $$;
revoke all on function public.handoff_actor(uuid) from public, anon, authenticated;
