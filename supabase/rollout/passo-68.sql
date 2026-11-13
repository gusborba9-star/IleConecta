-- PASSO 68: 0086_painel_financeiro_admin — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.finance_anomalies_b()
returns table (code text, severity text, payment_id uuid, detail text, amount_cents bigint, at timestamptz)
language sql stable security definer set search_path = public as $$
with a as (
select payment_id, count(*) n, coalesce(sum(amount_cents) filter (where entry_type = 'taxa_provedor'), 0) tx
from public.ledger_entries group by payment_id
), j as (
select p.*, coalesce(a.n, 0) ln, coalesce(a.tx, 0) tx
from public.payments p left join a on a.payment_id = p.id
)
select 'tarifa_do_provedor_pendente'::text, 'media'::text, id, 'Tarifa do provedor ainda desconhecida há mais de 2 dias (fica pendente, nunca zero).'::text, gross_cents, coalesce(confirmed_at, created_at)
from j where status = 'confirmado' and processor_fee_cents is null and coalesce(confirmed_at, created_at) < now() - interval '2 days'
union all
select 'tarifa_diverge_do_livro', 'media', id, format('Tarifa do provedor %s no pagamento, %s no livro-razão.', processor_fee_cents, tx), gross_cents, created_at
from j where status in ('confirmado', 'estornado', 'estornado_parcial', 'contestado') and processor_fee_cents is not null and ln > 0 and tx <> processor_fee_cents
union all
select 'confirmado_sem_data', 'media', id, 'Pagamento confirmado sem data de confirmação.', gross_cents, created_at
from j where status = 'confirmado' and confirmed_at is null
union all
select 'pendente_antigo', 'baixa', id, 'Pagamento pendente há mais de 24 horas.', gross_cents, created_at
from j where status = 'pendente' and created_at < now() - interval '1 day'
union all
select 'reembolso_parado', 'media', r.payment_id, format('Pedido de reembolso %s há mais de 3 dias sem conclusão.', r.status), r.amount_cents, r.created_at
from public.refund_requests r where r.status in ('pendente', 'aprovado') and r.created_at < now() - interval '3 days'
union all
select 'reembolso_sem_estorno', 'alta', r.payment_id, 'Reembolso marcado como concluído, mas o pagamento não está estornado.', r.amount_cents, coalesce(r.completed_at, r.created_at)
from public.refund_requests r join public.payments p on p.id = r.payment_id
where r.status = 'reembolsado' and p.status not in ('estornado', 'estornado_parcial');
$$;
