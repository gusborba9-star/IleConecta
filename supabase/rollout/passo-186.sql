-- PASSO 186: 0103_cancelar_com_divida_e_aceite_cartoes — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) permissões ============
revoke all on function public.platform_house_overdue_cents(uuid, date), public.billing_money_br(bigint), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz),
public.platform_reactivation_issue(uuid, text, timestamptz), public.platform_autocharge_due(timestamptz) from public, anon, authenticated;

grant execute on function public.platform_house_overdue_cents(uuid, date), public.billing_money_br(bigint), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz),
public.platform_reactivation_issue(uuid, text, timestamptz), public.platform_autocharge_due(timestamptz) to service_role;

grant execute on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_account_gate() to authenticated;
