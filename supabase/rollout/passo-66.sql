-- PASSO 66: 0086_painel_financeiro_admin — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: painel financeiro da administração (Blueprint §19.6 e §19.7).
-- Só leitura. Resumo do período e conferência (pagamentos × livro-razão × regra de comissão vigente na época).
-- Só o administrador executa; cada consulta fica registrada em admin_audit (chave 'finance_view').
-- Não consulta o provedor (Stripe): confere o que está no nosso banco. Valores em centavos inteiros.

-- ============ 1) resumo do período ============
create or replace function public.admin_finance_summary(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz; t jsonb; k jsonb; rf jsonb; cur text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  since := now() - make_interval(days => d);
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'finance_view', null, jsonb_build_object('tab', 'resumo', 'days', d));

  with p as (
    select pay.*, case when pay.reservation_id is not null then 'ritual' when pay.order_id is not null then 'servico' else 'mensalidade' end as kind
    from public.payments pay where pay.created_at >= since
  )
  select jsonb_build_object(
    'payments', count(*),
    'confirmed_n', count(*) filter (where status = 'confirmado'),
    'confirmed_gross_cents', coalesce(sum(gross_cents) filter (where status = 'confirmado'), 0),
    'platform_fee_cents', coalesce(sum(fee_cents) filter (where status = 'confirmado'), 0),
    'processor_fee_known_cents', coalesce(sum(processor_fee_cents) filter (where status = 'confirmado'), 0),
    'processor_fee_pending_n', count(*) filter (where status = 'confirmado' and processor_fee_cents is null),
    'refunded_n', count(*) filter (where status in ('estornado', 'estornado_parcial')),
    'refunded_gross_cents', coalesce(sum(gross_cents) filter (where status in ('estornado', 'estornado_parcial')), 0),
    'failed_n', count(*) filter (where status = 'falhou'),
    'pending_n', count(*) filter (where status = 'pendente'),
    'contested_n', count(*) filter (where status = 'contestado')
  ) into t from p;

  select coalesce(jsonb_agg(x order by x ->> 'kind'), '[]'::jsonb) into k from (
    select jsonb_build_object('kind', kind, 'n', count(*), 'gross_cents', sum(gross_cents), 'platform_fee_cents', coalesce(sum(fee_cents), 0)) x
    from (
      select pay.gross_cents, pay.fee_cents,
             case when pay.reservation_id is not null then 'ritual' when pay.order_id is not null then 'servico' else 'mensalidade' end as kind
      from public.payments pay where pay.created_at >= since and pay.status = 'confirmado'
    ) q group by kind
  ) s;

  select jsonb_build_object(
    'open_n', count(*) filter (where status in ('pendente', 'aprovado')),
    'open_oldest_days', coalesce((max(extract(day from now() - created_at)) filter (where status in ('pendente', 'aprovado')))::int, 0),
    'completed_n', count(*) filter (where status = 'reembolsado' and created_at >= since)
  ) into rf from public.refund_requests;

  select version into cur from public.current_fee_rules();

  return jsonb_build_object('days', d, 'generated_at', now(), 'fee_rule_version', cur, 'totals', t, 'by_kind', k, 'refunds', rf);
end $$;
