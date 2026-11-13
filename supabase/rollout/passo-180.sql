-- PASSO 180: 0101_cancelamento_e_tela_unica — parte 6 de 6
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

-- ============ 8) agenda: aplica cancelamentos vencidos (de hora em hora, pela data de Brasília) ============
select cron.unschedule('platform-cancel-apply') where exists (select 1 from cron.job where jobname = 'platform-cancel-apply');

select cron.schedule('platform-cancel-apply', '25 * * * *', $job$ select public.platform_cancel_apply_due() $job$);

-- ============ 9) permissões ============
revoke all on function public.platform_house_next_renewal(uuid, date), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz), public.platform_cancel_apply_due(timestamptz) from public, anon, authenticated;

grant execute on function public.platform_house_next_renewal(uuid, date), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz), public.platform_cancel_apply_due(timestamptz) to service_role;

revoke all on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_cancel_undo(), public.my_account_gate(), public.house_write_locked(uuid) from public, anon;

grant execute on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_cancel_undo(), public.my_account_gate(), public.house_write_locked(uuid) to authenticated, service_role;
