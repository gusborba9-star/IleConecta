-- PASSO 88: 0088_cobranca_motor — parte 13 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 13) permissões ============
revoke all on function public.platform_billing_immutable(), public.platform_charges_guard(), public.platform_billing_notice(uuid, text), public.platform_charge_issue(uuid, text, text, bigint, date, date, text, text, uuid), public.platform_charge_attach(uuid, text, text, text, text), public.platform_charge_progress(text, text, text, timestamptz), public.platform_charge_confirm(text, text, bigint, bigint, timestamptz), public.platform_charge_cancel(uuid, text), public.platform_house_billing_recompute(uuid, timestamptz), public.house_billing_blocked(uuid), public.platform_billing_tick(timestamptz), public.admin_billing_enroll(uuid, int, text), public.admin_billing_unenroll(uuid, text), public.payments_billing_block(), public.campaigns_billing_block() from public, anon, authenticated;

grant execute on function public.platform_billing_notice(uuid, text), public.platform_charge_issue(uuid, text, text, bigint, date, date, text, text, uuid), public.platform_charge_attach(uuid, text, text, text, text), public.platform_charge_progress(text, text, text, timestamptz), public.platform_charge_confirm(text, text, bigint, bigint, timestamptz), public.platform_house_billing_recompute(uuid, timestamptz), public.house_billing_blocked(uuid), public.platform_billing_tick(timestamptz) to service_role;

grant execute on function public.platform_charge_cancel(uuid, text), public.admin_billing_enroll(uuid, int, text), public.admin_billing_unenroll(uuid, text) to authenticated;

revoke all on public.house_billing_plan, public.house_billing_state, public.platform_charges, public.platform_billing_events, public.platform_ledger_entries, public.platform_billing_notices from anon, authenticated;

grant select on public.house_billing_plan, public.house_billing_state, public.platform_charges, public.platform_billing_events, public.platform_ledger_entries, public.platform_billing_notices to authenticated;
