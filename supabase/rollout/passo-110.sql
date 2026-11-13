-- PASSO 110: 0092_planos_e_foto_da_assistente — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- o cliente vê a foto só se a assistente está ativa e o plano da casa ainda inclui a assistente
create or replace function public.assistant_avatar_path(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select a.avatar_path from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and a.avatar_path is not null and public.assistant_monthly_limit(h.plan::text) > 0;
$$;

-- ============ 3) permissões ============
revoke all on function public.assistants_avatar_guard(), public.assistant_avatar_path(uuid) from public, anon, authenticated;

grant execute on function public.assistant_avatar_path(uuid) to authenticated;
