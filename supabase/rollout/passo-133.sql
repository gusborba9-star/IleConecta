-- PASSO 133: 0095_reembolso_creditos_7_dias — parte 5 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) valor proporcional (inteiro, em centavos, meio centavo para cima, nunca acima do que foi pago) ============
create or replace function public.platform_credit_refund_cents(p_paid bigint, p_remaining int, p_size int) returns bigint
language sql immutable set search_path = public as $$
select least(p_paid, (p_paid * p_remaining * 2 + p_size) / (p_size * 2));
$$;
