-- PASSO 67: 0086_painel_financeiro_admin — parte 2 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) conferência: pagamentos × livro-razão × regra de comissão ============
-- Duas partes internas (só o banco as chama) e uma função pública que as junta. O texto é compacto para caber na colagem do SQL Editor.
create or replace function public.finance_anomalies_a()
returns table (code text, severity text, payment_id uuid, detail text, amount_cents bigint, at timestamptz)
language sql stable security definer set search_path = public as $$
with a as (
select payment_id, count(*) n,
coalesce(sum(amount_cents) filter (where entry_type = 'bruto'), 0) br,
coalesce(sum(amount_cents) filter (where entry_type = 'plataforma'), 0) pl,
coalesce(sum(amount_cents) filter (where entry_type = 'casa'), 0) ca
from public.ledger_entries group by payment_id
), j as (
select p.*, case when p.reservation_id is not null then 'ritual' when p.order_id is not null then 'servico' else 'mensalidade' end as kind,
coalesce(a.n, 0) ln, coalesce(a.br, 0) br, coalesce(a.pl, 0) pl, coalesce(a.ca, 0) ca, v.rates as vrates
from public.payments p left join a on a.payment_id = p.id
left join public.fee_rule_versions v on v.version = p.fee_rule_version
)
select 'confirmado_sem_lancamentos'::text, 'alta'::text, id, 'Pagamento confirmado sem nenhum lançamento no livro-razão.'::text, gross_cents, coalesce(confirmed_at, created_at)
from j where status = 'confirmado' and ln = 0
union all
select 'lancamentos_nao_fecham', 'alta', id,
format('Bruto %s, plataforma %s e casa %s no livro-razão não batem com o pagamento (bruto %s, comissão %s).', br, pl, ca, gross_cents, coalesce(fee_cents::text, 'vazia')),
gross_cents, coalesce(confirmed_at, created_at)
from j where status = 'confirmado' and ln > 0 and (br <> gross_cents or pl is distinct from fee_cents or ca is distinct from (gross_cents - fee_cents))
union all
select 'comissao_ausente', 'alta', id, 'Pagamento confirmado sem comissão registrada.', gross_cents, coalesce(confirmed_at, created_at)
from j where status = 'confirmado' and fee_cents is null
union all
select 'estorno_nao_zerou', 'alta', id, format('Pagamento estornado, mas o livro-razão não zerou (bruto %s, plataforma %s, casa %s).', br, pl, ca), gross_cents, created_at
from j where status = 'estornado' and (br <> 0 or pl <> 0 or ca <> 0)
union all
select 'lancamentos_sem_cobranca', 'alta', id, format('Pagamento %s com %s lançamento(s) no livro-razão.', status, ln), gross_cents, created_at
from j where status in ('pendente', 'falhou') and ln > 0
union all
select 'comissao_diverge_da_regra', 'alta', id,
format('Comissão registrada %s, mas a regra %s (%s) resulta em %s.', coalesce(fee_cents::text, 'vazia'), fee_rule_version, kind, (gross_cents * (vrates ->> kind)::int + 5000) / 10000),
gross_cents, created_at
from j where vrates is not null and fee_cents is distinct from ((gross_cents * (vrates ->> kind)::int + 5000) / 10000)
union all
select 'regra_ausente', 'media', id, format('A regra de comissão "%s" não existe na tabela de taxas.', coalesce(fee_rule_version, 'vazia')), gross_cents, created_at
from j where vrates is null
union all
select 'contestado', 'alta', id, 'Pagamento contestado (disputa aberta no provedor).', gross_cents, created_at
from j where status = 'contestado';
$$;
