-- PASSO 111: 0092_planos_e_foto_da_assistente — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
drop trigger if exists trg_assistants_avatar_guard on public.assistants;

create trigger trg_assistants_avatar_guard before insert or update on public.assistants
for each row execute function public.assistants_avatar_guard();

-- o cliente vê a foto só se a assistente está ativa e o plano da casa ainda inclui a assistente
create or replace function public.assistant_avatar_path(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select a.avatar_path from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and a.avatar_path is not null and public.assistant_monthly_limit(h.plan::text) > 0;
$$;
