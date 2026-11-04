-- 0065 — EXEC-01: (1) check_cron_secret reproduzível em ambientes novos; (2) detecção de anomalias entre provedor e banco.
-- Idempotente (create or replace / drop if exists). Não altera dados existentes e não muda regra comercial.

-- ============ 1) check_cron_secret ============
-- A rotina agendada de pagamentos autentica por "x-cron-secret" chamando esta função. Em produção ela foi criada fora das
-- migrations (SQL direto), então um ambiente novo reproduzido a partir do repositório ficava sem ela e a rotina falhava.
-- Definição abaixo = a de produção (SECURITY DEFINER, search_path vazio, lê o segredo "cron_secret" do Vault).
-- Sem o Vault (ambiente local/CI), nasce FECHADA: nega sempre, nunca aceita segredo.
do $$
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute $f$
      create or replace function public.check_cron_secret(p_secret text) returns boolean
      language sql security definer set search_path to ''
      as $b$ select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = p_secret) $b$
    $f$;
  else
    execute $f$
      create or replace function public.check_cron_secret(p_secret text) returns boolean
      language sql security definer set search_path to ''
      as $b$ select false $b$
    $f$;
  end if;
end $$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- ============ 2) anomalias entre provedor e banco (somente leitura) ============
-- Lista o que exige investigação humana. NÃO corrige, estorna nem movimenta nada.
--  evento_rejeitado     : aviso do provedor recusado por divergência (ref/conta diferentes) OU cobrança paga sem pagamento
--                         correspondente. É o rastro de uma cobrança paga que o banco não conseguiu vincular.
--  tarifa_zero_suspeita : cartão confirmado/estornado com tarifa do processador igual a zero (tarifa de cartão nunca é zero).
--  tarifa_pendente      : confirmado há mais de 1 h e ainda sem tarifa conciliada.
--  sem_ledger           : pagamento confirmado sem lançamento bruto no ledger.
--  ledger_desbalanceado : bruto líquido diferente de casa + plataforma.
create or replace function public.payments_provider_anomalies(p_limit integer default 200)
returns table (kind text, payment_id uuid, event_id text, provider_ref text, detail text, occurred_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  return query
  select * from (
    select 'evento_rejeitado'::text k,
           case when (e.payload #>> '{data,object,metadata,payment_id}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (e.payload #>> '{data,object,metadata,payment_id}')::uuid end pid,
           e.id eid, (e.payload #>> '{data,object,id}') ref, e.error det, e.received_at at_
      from public.stripe_events e where e.error like 'rejeitado:%'
    union all
    select 'tarifa_zero_suspeita', p.id, null, p.provider_ref, 'cartão com tarifa do processador = 0', p.created_at
      from public.payments p
     where p.provider = 'stripe' and p.status in ('confirmado', 'estornado') and p.payment_method = 'card' and p.processor_fee_cents = 0
    union all
    select 'tarifa_pendente', p.id, null, p.provider_ref, 'confirmado sem tarifa conciliada há mais de 1 h', min(l.created_at)
      from public.payments p join public.ledger_entries l on l.payment_id = p.id and l.entry_type = 'bruto'
     where p.provider = 'stripe' and p.status = 'confirmado' and p.processor_fee_cents is null
     group by p.id, p.provider_ref
    having min(l.created_at) < now() - interval '1 hour'
    union all
    select 'sem_ledger', p.id, null, p.provider_ref, 'confirmado sem lançamento bruto', p.created_at
      from public.payments p
     where p.status = 'confirmado' and not exists (select 1 from public.ledger_entries l where l.payment_id = p.id and l.entry_type = 'bruto')
    union all
    select 'ledger_desbalanceado', l.payment_id, null, null,
           'bruto=' || coalesce(sum(l.amount_cents) filter (where l.entry_type = 'bruto'), 0)
           || ' casa+plataforma=' || coalesce(sum(l.amount_cents) filter (where l.entry_type in ('casa', 'plataforma')), 0), max(l.created_at)
      from public.ledger_entries l
     group by l.payment_id
    having coalesce(sum(l.amount_cents) filter (where l.entry_type = 'bruto'), 0)
        <> coalesce(sum(l.amount_cents) filter (where l.entry_type in ('casa', 'plataforma')), 0)
  ) a
  order by a.at_ desc
  limit greatest(least(coalesce(p_limit, 200), 1000), 1);
end $$;
revoke all on function public.payments_provider_anomalies(integer) from public, anon, authenticated;
grant execute on function public.payments_provider_anomalies(integer) to service_role;
