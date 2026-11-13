-- PASSO 105: 0091_creditos_de_ia — parte 7 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) saldo, limite do plano e consumo ============
create or replace function public.ai_credit_balance(p_house uuid) returns int
language sql stable security definer set search_path = public as $$
select coalesce(sum(remaining), 0)::int from public.ai_credit_packs where house_id = p_house and expires_at > now();
$$;

create or replace function public.assistant_monthly_limit(p_plan text) returns int
language sql stable security definer set search_path = public as $$
select coalesce(nullif((public.plan_matrix() -> 'caps' -> p_plan ->> 'assistant_replies'), '')::int, 0);
$$;
