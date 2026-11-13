-- PASSO 164: 0099_reativacao_por_pagamento — parte 6 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) permissões ============
revoke all on function public.platform_reactivation_issue(uuid, timestamptz), public.platform_house_reactivated_by_payment() from public, anon, authenticated;

grant execute on function public.platform_reactivation_issue(uuid, timestamptz) to service_role;

revoke all on function public.admin_billing_reactivate(uuid, text) from public, anon, authenticated;

grant execute on function public.admin_billing_reactivate(uuid, text) to authenticated, service_role;
