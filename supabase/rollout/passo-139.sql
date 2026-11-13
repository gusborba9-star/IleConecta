-- PASSO 139: 0095_reembolso_creditos_7_dias — parte 11 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) permissões ============
revoke all on public.platform_credit_refunds from anon, authenticated;

grant select on public.platform_credit_refunds to authenticated;

revoke all on function public.platform_credit_refunds_guard(), public.platform_credit_refund_cents(bigint, int, int), public.platform_credit_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_credit_refund_done(uuid, text, timestamptz),
public.platform_credit_refund_fail(uuid, text), public.platform_credit_refunds_pending(interval), public.my_credit_refunds() from public, anon, authenticated;

grant execute on function public.platform_credit_refund_cents(bigint, int, int), public.platform_credit_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_credit_refund_done(uuid, text, timestamptz),
public.platform_credit_refund_fail(uuid, text), public.platform_credit_refunds_pending(interval) to service_role;

grant execute on function public.my_credit_refunds() to authenticated, service_role;
