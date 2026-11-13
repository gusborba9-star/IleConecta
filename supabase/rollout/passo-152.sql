-- PASSO 152: 0098_reembolso_plano_7_dias — parte 6 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
drop trigger if exists trg_platform_plan_refunds_guard on public.platform_plan_refunds;

create trigger trg_platform_plan_refunds_guard before update or delete on public.platform_plan_refunds
for each row execute function public.platform_plan_refunds_guard();
