-- PASSO 75: 0087_cobranca_base — parte 6 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) permissões ============
revoke all on function public.billing_config_default(), public.billing_config_ok(jsonb), public.billing_prices_default(), public.billing_prices_ok(jsonb), public.platform_billing_config(), public.platform_billing_prices(), public.billing_is_business_day(date), public.billing_add_business_days(date, int), public.admin_set_billing_holiday(date, text, boolean) from public, anon, authenticated;

grant execute on function public.platform_billing_config(), public.platform_billing_prices(), public.billing_is_business_day(date), public.billing_add_business_days(date, int) to service_role;

grant execute on function public.admin_set_billing_holiday(date, text, boolean) to authenticated;

revoke all on public.billing_holidays from anon, authenticated;

grant select on public.billing_holidays to authenticated;
