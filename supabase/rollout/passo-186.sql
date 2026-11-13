-- PASSO 186: 0101_cancelamento_e_tela_unica — parte 12 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) trava no servidor: casa em bloqueio total não grava mais nada da casa ============
create or replace function public.house_write_locked(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select h is not null and not public.is_admin() and public.house_billing_level(h) = 'total';
$$;

do $$
declare t text;
begin
foreach t in array array['assistants', 'boosts', 'events', 'house_availability', 'house_blocks', 'house_campaigns', 'house_catalog_items', 'house_quick_replies', 'house_staff', 'house_staff_invites', 'posts', 'services', 'stories'] loop
execute format('drop policy if exists billing_lock_ins on public.%I', t);
execute format('create policy billing_lock_ins on public.%I as restrictive for insert to authenticated with check (not public.house_write_locked(house_id))', t);
execute format('drop policy if exists billing_lock_upd on public.%I', t);
execute format('create policy billing_lock_upd on public.%I as restrictive for update to authenticated using (not public.house_write_locked(house_id)) with check (not public.house_write_locked(house_id))', t);
execute format('drop policy if exists billing_lock_del on public.%I', t);
execute format('create policy billing_lock_del on public.%I as restrictive for delete to authenticated using (not public.house_write_locked(house_id))', t);
end loop;
end $$;
