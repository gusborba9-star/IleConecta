-- PASSO 108: 0091_creditos_de_ia — parte 10 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) permissões ============
revoke all on function public.ai_credit_packs_guard(), public.ai_credit_packs_on_refund(), public.ai_credit_balance(uuid), public.assistant_monthly_limit(text), public.assistant_record_usage(uuid, uuid, text, int, int), public.my_ai_credit_status(), public.platform_credit_purchase(uuid, text) from public, anon, authenticated;

grant execute on function public.ai_credit_balance(uuid), public.assistant_monthly_limit(text), public.assistant_record_usage(uuid, uuid, text, int, int), public.platform_credit_purchase(uuid, text) to service_role;

grant execute on function public.my_ai_credit_status() to authenticated, service_role;

revoke all on public.ai_credit_packs, public.ai_credit_ledger from anon, authenticated;

grant select on public.ai_credit_packs to authenticated;

grant select on public.ai_credit_ledger to authenticated;
