-- PASSO 168: 0100_reajuste_tabela_comercial — parte 4 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) valor da mensalidade de um plano numa data de renovação ============
create or replace function public.platform_plan_monthly_cents(p_plan text, p_on date) returns bigint
language sql stable security definer set search_path = public as $$
select coalesce(
(select c.new_cents from public.platform_price_changes c where c.plan = p_plan and c.status = 'anunciado' and c.effective_on <= p_on order by c.effective_on desc limit 1),
(select case when (value -> 'plans' -> p_plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((value -> 'plans' -> p_plan ->> 'monthly')::numeric * 100)::bigint end from public.platform_settings where key = 'pricing'));
$$;
