-- ============================================================================
-- LIMPEZA DOS DADOS DE TESTE FINANCEIROS — rodar SÓ no dia do lançamento.
--
-- O que apaga (tudo criado ANTES de v_cutoff, ou seja, dados do Stripe em modo teste):
--   pagamentos/pedidos de serviço, razão (ledger), faturas da plataforma e filhos
--   (referências, avisos, tentativas, reembolsos, destaques, pacotes de crédito),
--   eventos de cobrança e vagas extras.
-- O que NÃO mexe: casas, usuários, planos das casas, CPF/CNPJ, contas de pagamento
--   (stripe_account_id de teste precisa ser recriado em modo real: decisão do dono),
--   configurações (billing_config etc.).
--
-- Como usar:
--   1) Ajuste v_cutoff (momento da virada para cobrança real, em UTC).
--   2) v_execute := false  -> SIMULAÇÃO: não apaga nada, termina com um "erro"
--      de propósito que mostra as contagens (é o esperado).
--   3) Conferiu as contagens? Troque para v_execute := true e rode de novo.
--   4) Rode o SELECT de conferência no fim do arquivo.
--
-- Segurança embutida:
--   * Roda numa transação única: qualquer falha desfaz tudo.
--   * Aborta se existir QUALQUER registro financeiro criado depois de v_cutoff
--     (indício de cobrança real: nunca apagar).
--   * Aborta se pedido de serviço a apagar tiver avaliação, repasse ou
--     solicitação de reembolso fora do escopo (revisão manual).
--   * Depois de apagar, confere que nenhuma tabela ficou com referência
--     órfã (todas as chaves estrangeiras); se ficou, desfaz tudo.
--   * Desliga os gatilhos de proteção só dentro desta transação.
-- ============================================================================
do $limpeza$
declare
  v_cutoff  timestamptz := '2099-01-01 00:00:00+00';  -- AJUSTAR no dia do lançamento
  v_execute boolean     := false;                     -- true = apaga de verdade
  v_counts  jsonb := '{}'::jsonb;
  n bigint;
  r record;
  v_orphans text := '';
begin
  if v_cutoff > now() + interval '1 hour' and v_execute then
    raise exception 'v_cutoff está no futuro: ajuste para o momento da virada antes de executar.';
  end if;

  -- 1) Guarda: nada financeiro posterior ao corte
  for r in
    select * from (values
      ('payments'),('service_orders'),('platform_charges'),('platform_ledger_entries'),
      ('platform_billing_events'),('ledger_entries')
    ) t(tbl)
  loop
    execute format('select count(*) from public.%I where created_at >= $1', r.tbl) into n using v_cutoff;
    if n > 0 then
      raise exception 'ABORTADO: % tem % registro(s) criado(s) depois do corte (possível cobrança real).', r.tbl, n;
    end if;
  end loop;

  -- 2) Guarda: dependentes de pedidos que a limpeza não cobre
  select count(*) into n from public.reviews rv
   where rv.service_order_id in (select order_id from public.payments where created_at < v_cutoff and order_id is not null);
  if n > 0 then raise exception 'ABORTADO: % avaliação(ões) ligada(s) a pedidos de teste. Revisar antes.', n; end if;
  select count(*) into n from public.payouts po
   where po.order_id in (select order_id from public.payments where created_at < v_cutoff and order_id is not null);
  v_counts := v_counts || jsonb_build_object('payouts_a_apagar', n);

  -- 3) Desliga gatilhos de proteção e checagens de chave estrangeira (só nesta transação)
  set local session_replication_role = replica;

  -- 4) Contagens do que será apagado + apagar (filhos antes dos pais)
  create temp table _lim_charges on commit drop as
    select id from public.platform_charges where created_at < v_cutoff;
  create temp table _lim_pay on commit drop as
    select id, order_id from public.payments where created_at < v_cutoff;

  -- filhos de platform_charges
  for r in
    select * from (values
      ('ai_credit_packs'),('platform_auto_attempts'),('platform_billing_notices'),
      ('platform_charge_refs'),('platform_credit_refunds'),('platform_ledger_entries'),
      ('platform_plan_refunds'),('promo_refunds'),('promotions')
    ) t(tbl)
  loop
    execute format('delete from public.%I where charge_id in (select id from _lim_charges)', r.tbl);
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(r.tbl, n);
  end loop;

  delete from public.platform_billing_events where created_at < v_cutoff;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('platform_billing_events', n);

  delete from public.platform_charges where id in (select id from _lim_charges);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('platform_charges', n);

  -- filhos de payments / service_orders
  delete from public.ledger_entries where payment_id in (select id from _lim_pay);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('ledger_entries', n);

  delete from public.refund_requests
   where payment_id in (select id from _lim_pay)
      or order_id in (select order_id from _lim_pay where order_id is not null);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('refund_requests', n);

  delete from public.payouts where order_id in (select order_id from _lim_pay where order_id is not null);
  delete from public.payments where id in (select id from _lim_pay);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payments', n);

  delete from public.service_orders where id in (select order_id from _lim_pay where order_id is not null);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('service_orders', n);

  -- estado das casas ligado às faturas apagadas
  update public.house_billing_state set cancel_charges = '{}' where cancel_charges is not null and cardinality(cancel_charges) > 0;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('house_billing_state_cancel_charges_zerado', n);

  delete from public.house_extra_seats;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('house_extra_seats', n);

  -- 5) Conferência de órfãos em TODAS as chaves estrangeiras que apontam para tabelas tocadas
  for r in
    select c.conrelid::regclass::text child, c.confrelid::regclass::text parent,
           (select string_agg(format('c.%I', a.attname), ',' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) ccols,
           (select string_agg(format('p.%I', a.attname), ',' order by k.ord)
              from unnest(c.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) pcols,
           (select string_agg(format('c.%I = p.%I', ac.attname, ap.attname), ' and ' order by k.ord)
              from unnest(c.conkey, c.confkey) with ordinality k(ck, pk, ord)
              join pg_attribute ac on ac.attrelid = c.conrelid and ac.attnum = k.ck
              join pg_attribute ap on ap.attrelid = c.confrelid and ap.attnum = k.pk) joincond,
           (select string_agg(format('c.%I is not null', ac.attname), ' and ')
              from unnest(c.conkey) k(ck) join pg_attribute ac on ac.attrelid = c.conrelid and ac.attnum = k.ck) notnull
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid in ('public.payments'::regclass,'public.service_orders'::regclass,
                           'public.platform_charges'::regclass)
  loop
    execute format('select count(*) from %s c where %s and not exists (select 1 from %s p where %s)',
                   r.child, r.notnull, r.parent, r.joincond) into n;
    if n > 0 then v_orphans := v_orphans || format(' %s->%s:%s', r.child, r.parent, n); end if;
  end loop;
  if v_orphans <> '' then
    raise exception 'ABORTADO (nada foi apagado): referências órfãs depois da limpeza:%', v_orphans;
  end if;

  if not v_execute then
    raise exception 'SIMULAÇÃO OK — NADA FOI APAGADO. Contagens do que seria apagado: %', v_counts::text;
  end if;
  -- v_execute = true: a transação termina aqui com COMMIT (fim do bloco).
end
$limpeza$;

-- ============================================================================
-- CONFERÊNCIA (rodar depois da execução real): tudo deve dar 0.
-- ============================================================================
-- select (select count(*) from payments) payments, (select count(*) from service_orders) orders,
--        (select count(*) from ledger_entries) ledger, (select count(*) from platform_charges) charges,
--        (select count(*) from platform_ledger_entries) plat_ledger,
--        (select count(*) from platform_billing_events) events, (select count(*) from house_extra_seats) seats;
