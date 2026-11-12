-- PASSO 68: 0086_painel_financeiro_admin — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) permissões ============
revoke all on function public.admin_finance_summary(int), public.admin_finance_anomalies() from public, anon;

grant execute on function public.admin_finance_summary(int), public.admin_finance_anomalies() to authenticated;
