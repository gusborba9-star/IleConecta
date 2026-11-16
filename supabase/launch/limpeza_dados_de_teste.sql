-- ============================================================================
-- LIMPEZA DOS DADOS DE TESTE FINANCEIROS — rodar SÓ no dia do lançamento.
--
-- O que apaga (tudo criado ANTES de v_cutoff, ou seja, dados do Stripe em modo teste):
--   pagamentos e pedidos de serviço pagos, razão (ledger) e repasses/reembolsos ligados a eles,
--   faturas da plataforma e tudo que depende delas (referências, avisos, tentativas, reembolsos de
--   plano/vaga/créditos/destaque, pacotes de crédito e seu consumo, destaques e impulsionamentos),
--   eventos de cobrança e vagas extras.
-- O que NÃO mexe (decisão do dono, ver o resultado da simulação):
--   casas, usuários, plano atual de cada casa, assinatura (house_billing_plan/state), CPF/CNPJ,
--   contas de pagamento (os stripe_account_id de TESTE não valem em modo real: precisam ser
--   recriados pelas casas), configurações (billing_config, preços).
--
-- Como usar:
--   1) Ajuste v_cutoff para o momento da virada para cobrança real (UTC).
--   2) v_execute := false  -> SIMULAÇÃO: não apaga nada e termina com um "erro" de propósito
--      que mostra as contagens (é o esperado).
--   3) Conferiu as contagens? Troque para v_execute := true e rode de novo.
--   4) Rode o SELECT de conferência no fim do arquivo.
--
-- Segurança embutida:
--   * Uma transação única: qualquer falha desfaz tudo (inclusive as travas desligadas).
--   * As chaves estrangeiras continuam LIGADAS: se sobrar algo que dependa do que será apagado,
--     o banco recusa e nada é apagado.
--   * Aborta se existir QUALQUER registro financeiro criado depois de v_cutoff (indício de cobrança
--     real: nunca apagar) e se v_cutoff estiver no futuro ao executar.
--   * Avaliações ligadas a pedidos de teste só são apagadas se você ligar v_apagar_avaliacoes (a simulação avisa quantas são).
--   * Só desliga os gatilhos de proteção das tabelas listadas, dentro da transação, e religa no fim.
-- ============================================================================
do $limpeza$
declare
  v_cutoff  timestamptz := '2099-01-01 00:00:00+00';  -- AJUSTAR no dia do lançamento
  v_execute boolean     := false;                     -- true = apaga de verdade
  v_apagar_avaliacoes boolean := false;               -- true = também apaga avaliações ligadas a pedidos de teste
  v_counts  jsonb := '{}'::jsonb;
  v_keep    jsonb;
  v_tables  text[] := array['ai_credit_ledger','ai_credit_packs','platform_credit_refunds','platform_plan_refunds','platform_seat_refunds',
    'promo_refunds','promotions','platform_auto_attempts','platform_billing_notices','platform_charge_refs','platform_ledger_entries',
    'platform_billing_events','platform_charges','house_debits','ledger_entries','refund_requests','payouts','payments','service_orders','house_extra_seats'];
  v_reviews bigint;
  n bigint;
  t text;
begin
  if v_execute and v_cutoff > now() + interval '1 hour' then
    raise exception 'v_cutoff está no futuro: ajuste para o momento da virada antes de executar.';
  end if;

  -- 1) Guarda: nada financeiro posterior ao corte
  foreach t in array array['payments','service_orders','platform_charges','platform_ledger_entries','platform_billing_events','ledger_entries'] loop
    execute format('select count(*) from public.%I where created_at >= $1', t) into n using v_cutoff;
    if n > 0 then
      raise exception 'ABORTADO: % tem % registro(s) criado(s) depois do corte (possível cobrança real).', t, n;
    end if;
  end loop;

  -- 2) Avaliações de pedidos de teste: ao executar, só seguem se o dono autorizar (v_apagar_avaliacoes := true)
  select count(*) into v_reviews from public.reviews rv
   where rv.service_order_id in (select order_id from public.payments where created_at < v_cutoff and order_id is not null);
  if v_reviews > 0 and v_execute and not v_apagar_avaliacoes then
    raise exception 'ABORTADO: % avaliação(ões) ligada(s) a pedidos de teste. Revise e, se forem de teste, ponha v_apagar_avaliacoes := true.', v_reviews;
  end if;

  -- 3) O que fica (informativo, para o dono decidir depois)
  v_keep := jsonb_build_object(
    'casas_com_plano_pago', (select count(*) from public.houses where plan::text <> 'gratis'),
    'assinaturas_ativas', (select count(*) from public.house_billing_plan where active),
    'casas_com_conta_stripe_de_teste', (select count(*) from public.house_payment_accounts where stripe_account_id is not null),
    'cpf_cnpj_guardados', (select count(*) from public.house_tax_ids),
    'avaliacoes_de_pedidos_de_teste', v_reviews);

  -- 4) Desliga só os gatilhos de proteção (imutabilidade) das tabelas que serão limpas
  foreach t in array v_tables loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  create temp table _lim_charges on commit drop as select id from public.platform_charges where created_at < v_cutoff;
  create temp table _lim_pay on commit drop as select id, order_id from public.payments where created_at < v_cutoff;

  -- 5) Apaga, filhos antes dos pais (as chaves estrangeiras seguem valendo)
  delete from public.ai_credit_ledger where pack_id in (select id from public.ai_credit_packs where charge_id in (select id from _lim_charges));
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('ai_credit_ledger', n);

  foreach t in array array['platform_credit_refunds','ai_credit_packs','platform_plan_refunds','platform_seat_refunds','promo_refunds','promotions',
      'platform_auto_attempts','platform_billing_notices','platform_charge_refs','platform_ledger_entries'] loop
    execute format('delete from public.%I where charge_id in (select id from _lim_charges)', t);
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object(t, n);
  end loop;

  delete from public.platform_billing_events where created_at < v_cutoff;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('platform_billing_events', n);

  delete from public.platform_charges where id in (select id from _lim_charges);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('platform_charges', n);

  delete from public.ledger_entries where payment_id in (select id from _lim_pay);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('ledger_entries', n);

  delete from public.house_debits where refund_id in (select id from public.refund_requests
    where payment_id in (select id from _lim_pay) or order_id in (select order_id from _lim_pay where order_id is not null));
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('house_debits', n);

  delete from public.refund_requests
   where payment_id in (select id from _lim_pay) or order_id in (select order_id from _lim_pay where order_id is not null);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('refund_requests', n);

  delete from public.payouts where order_id in (select order_id from _lim_pay where order_id is not null);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payouts', n);

  delete from public.payments where id in (select id from _lim_pay);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payments', n);

  delete from public.reviews where service_order_id in (select order_id from _lim_pay where order_id is not null);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('reviews', n);

  delete from public.service_orders where id in (select order_id from _lim_pay where order_id is not null);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('service_orders', n);

  update public.house_billing_state set cancel_charges = '{}' where cancel_charges is not null and cardinality(cancel_charges) > 0;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('house_billing_state_cancel_charges_zerado', n);

  delete from public.house_extra_seats;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('house_extra_seats', n);

  -- 6) Religa as travas
  foreach t in array v_tables loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  if not v_execute then
    raise exception 'SIMULAÇÃO OK — NADA FOI APAGADO. Seria apagado: %. Permanece (decisão do dono): %', v_counts::text, v_keep::text;
  end if;
end
$limpeza$;

-- ============================================================================
-- CONFERÊNCIA (rodar depois da execução real): as 7 primeiras colunas devem dar 0.
-- ============================================================================
-- select (select count(*) from payments) payments, (select count(*) from service_orders) orders,
--        (select count(*) from ledger_entries) ledger, (select count(*) from platform_charges) charges,
--        (select count(*) from platform_ledger_entries) plat_ledger,
--        (select count(*) from platform_billing_events) events, (select count(*) from house_extra_seats) seats,
--        (select count(*) from pg_trigger where tgrelid='public.platform_charges'::regclass and tgenabled='D') gatilhos_desligados;
