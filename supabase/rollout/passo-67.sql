-- PASSO 67: 0086_painel_financeiro_admin — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) conferência: pagamentos × livro-razão × regra de comissão ============
create or replace function public.admin_finance_anomalies()
returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'finance_view', null, jsonb_build_object('tab', 'conferencia'));

  with a as (
    select payment_id, count(*) n,
      coalesce(sum(amount_cents) filter (where entry_type = 'bruto'), 0) br,
      coalesce(sum(amount_cents) filter (where entry_type = 'plataforma'), 0) pl,
      coalesce(sum(amount_cents) filter (where entry_type = 'casa'), 0) ca,
      coalesce(sum(amount_cents) filter (where entry_type = 'taxa_provedor'), 0) tx
    from public.ledger_entries group by payment_id
  ), k as (
    select p.*, case when p.reservation_id is not null then 'ritual' when p.order_id is not null then 'servico' else 'mensalidade' end as kind
    from public.payments p
  ), j as (
    select k.*, coalesce(a.n, 0) ln, coalesce(a.br, 0) br, coalesce(a.pl, 0) pl, coalesce(a.ca, 0) ca, coalesce(a.tx, 0) tx,
           v.rates as vrates
    from k left join a on a.payment_id = k.id
    left join public.fee_rule_versions v on v.version = k.fee_rule_version
  ), an as (
  select 'confirmado_sem_lancamentos'::text as code, 'alta'::text as severity, id as payment_id, 'Pagamento confirmado sem nenhum lançamento no livro-razão.'::text as detail, gross_cents as amount_cents, coalesce(confirmed_at, created_at) as at
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
  select 'estorno_nao_zerou', 'alta', id, format('Pagamento estornado, mas o livro-razão não zerou (bruto %s, plataforma %s, casa %s).', br, pl, ca),
    gross_cents, created_at
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
    from j where status = 'contestado'
  union all
  select 'tarifa_do_provedor_pendente', 'media', id, 'Tarifa do provedor ainda desconhecida há mais de 2 dias (fica pendente, nunca zero).', gross_cents, coalesce(confirmed_at, created_at)
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
    where r.status = 'reembolsado' and p.status not in ('estornado', 'estornado_parcial')
  ), top as (
    select * from an order by case severity when 'alta' then 0 when 'media' then 1 else 2 end, at desc limit 200
  )
  select jsonb_build_object('generated_at', now(), 'total', (select count(*) from an), 'shown', (select count(*) from top),
    'counts', (select coalesce(jsonb_object_agg(code, n), '{}'::jsonb) from (select code, count(*) n from an group by code) c),
    'items', (select coalesce(jsonb_agg(to_jsonb(t) order by case t.severity when 'alta' then 0 when 'media' then 1 else 2 end, t.at desc), '[]'::jsonb) from top t),
    'scope', 'Confere pagamentos, livro-razão, regra de comissão e reembolsos do nosso banco. Não consulta o Stripe.')
  into res;
  return res;
end $$;
