-- PASSO 158: 0098_reembolso_plano_7_dias — parte 12 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
grant execute on function public.platform_plan_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_plan_refund_done(uuid, text, timestamptz),
public.platform_plan_refund_fail(uuid, text), public.platform_plan_refunds_pending(interval) to service_role;

grant execute on function public.my_plan_refund() to authenticated, service_role;

grant execute on function public.admin_billing_reactivate(uuid, text) to authenticated, service_role;
