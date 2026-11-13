-- PASSO 128: 0094_cobranca_automatica_cartao — parte 14 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) permissões ============
revoke all on public.house_card_on_file, public.house_card_setups, public.platform_auto_attempts from anon, authenticated;

grant select on public.platform_auto_attempts to authenticated;

revoke all on function public.billing_auto_max_attempts(), public.billing_auto_card_enabled(), public.platform_card_customer(uuid, text, text), public.platform_card_setup_open(uuid, text, text), public.platform_card_save(uuid, text, text, text, text, text, text, int, int), public.platform_card_set_auto(uuid, boolean), public.platform_card_remove(uuid), public.platform_card_get(uuid), public.platform_autocharge_due(timestamptz), public.platform_auto_attempt_begin(uuid, int, timestamptz), public.platform_auto_attempt_result(uuid, int, text, text, text), public.platform_billing_notice(uuid, text), public.my_card_status() from public, anon, authenticated;

grant execute on function public.billing_auto_max_attempts(), public.billing_auto_card_enabled(), public.platform_card_customer(uuid, text, text), public.platform_card_setup_open(uuid, text, text), public.platform_card_save(uuid, text, text, text, text, text, text, int, int), public.platform_card_set_auto(uuid, boolean), public.platform_card_remove(uuid), public.platform_card_get(uuid), public.platform_autocharge_due(timestamptz), public.platform_auto_attempt_begin(uuid, int, timestamptz), public.platform_auto_attempt_result(uuid, int, text, text, text), public.platform_billing_notice(uuid, text) to service_role;

grant execute on function public.my_card_status() to authenticated, service_role;
