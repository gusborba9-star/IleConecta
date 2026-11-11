-- PASSO 33: 0073 — funções do serviço privado (oferta no chat)
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- Prova de oferta: só o servidor grava mensagem da assistente (from_assistant) com o botão de pagamento (action) do serviço.
create or replace function public.service_offered_to_me(p_service uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
     where m.from_assistant and m.action ->> 'target' = 'service' and m.action ->> 'id' = p_service::text);
$$;
revoke all on function public.service_offered_to_me(uuid) from public, anon, authenticated;

-- Pode contratar/agendar? Serviço ativo e (na página, ou da própria casa, ou oferecido a mim no chat, ou chamada do servidor).
create or replace function public.service_purchasable(p_service uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.services s
     where s.id = p_service and s.active
       and (s.listed or auth.role() = 'service_role' or public.is_house_owner(s.house_id) or public.service_offered_to_me(s.id)));
$$;
revoke all on function public.service_purchasable(uuid) from public, anon;
grant execute on function public.service_purchasable(uuid) to authenticated, service_role;

-- O botão de pagamento do chat lê o serviço por aqui (a leitura direta esconde o privado).
create or replace function public.service_for_chat(p_service uuid)
returns setof public.services language sql stable security definer set search_path = public as $$
  select s.* from public.services s where s.id = p_service and public.service_purchasable(s.id);
$$;
revoke all on function public.service_for_chat(uuid) from public, anon;
grant execute on function public.service_for_chat(uuid) to authenticated;

