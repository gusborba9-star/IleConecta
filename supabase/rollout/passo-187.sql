-- PASSO 187: 0101_cancelamento_e_tela_unica — parte 13 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) agenda: aplica cancelamentos vencidos (de hora em hora, pela data de Brasília) ============
select cron.unschedule('platform-cancel-apply') where exists (select 1 from cron.job where jobname = 'platform-cancel-apply');

select cron.schedule('platform-cancel-apply', '25 * * * *', $job$ select public.platform_cancel_apply_due() $job$);

-- ============ 9) permissões ============
revoke all on function public.platform_house_next_renewal(uuid, date), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz), public.platform_cancel_apply_due(timestamptz) from public, anon, authenticated;

grant execute on function public.platform_house_next_renewal(uuid, date), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz), public.platform_cancel_apply_due(timestamptz) to service_role;

revoke all on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_cancel_undo(), public.my_account_gate(), public.house_write_locked(uuid) from public, anon;

grant execute on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_cancel_undo(), public.my_account_gate(), public.house_write_locked(uuid) to authenticated, service_role;
