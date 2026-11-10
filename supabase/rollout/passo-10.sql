-- PASSO 10 de 19: 0066: referencias do provedor
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 0066 — EXEC-01: integridade de referências Checkout ↔ PaymentIntent ↔ Charge ↔ Pagamento ↔ Ledger.
-- Até aqui só a sessão de checkout (payments.provider_ref) ficava registrada. Sem o PaymentIntent e a Charge, uma segunda cobrança
-- paga para o mesmo pagamento (caso "de60") não era detectável nem vinculável. Esta migration só ADICIONA (colunas nulas, índices
-- únicos parciais, funções). Idempotente. Não altera valores, status, ledger nem dados existentes.

alter table public.payments add column if not exists provider_payment_ref text;  -- PaymentIntent (pi_…)
alter table public.payments add column if not exists provider_charge_ref text;   -- Charge (ch_…)

-- Uma mesma cobrança/PaymentIntent do provedor nunca pode estar vinculada a dois pagamentos.
create unique index if not exists payments_provider_payment_ref_uq
  on public.payments (provider, provider_payment_ref) where provider_payment_ref is not null;
create unique index if not exists payments_provider_charge_ref_uq
  on public.payments (provider, provider_charge_ref) where provider_charge_ref is not null;

-- Grava PaymentIntent + Charge de um pagamento JÁ confirmado/estornado, conferindo a identidade da transação.
-- Grava uma única vez: repetir o mesmo par é 'ja_registrada'; par diferente é 'conflito' (nada é sobrescrito);
-- referência já usada por outro pagamento é 'duplicada'.
create or replace function public.record_provider_refs_for(
  p_payment uuid, p_provider text, p_provider_ref text, p_account text, p_payment_ref text, p_charge_ref text
) returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if nullif(btrim(p_payment_ref), '') is null or nullif(btrim(p_charge_ref), '') is null then raise exception 'Referências inválidas.'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then return 'divergente'; end if;
  if not public.payment_identity_matches(pay, p_provider, p_provider_ref, p_account) then return 'divergente'; end if;
  if pay.status::text not in ('confirmado', 'estornado') then return 'nao_confirmada'; end if;
  if pay.provider_payment_ref is not null or pay.provider_charge_ref is not null then
    if pay.provider_payment_ref is not distinct from p_payment_ref and pay.provider_charge_ref is not distinct from p_charge_ref then return 'ja_registrada'; end if;
    return 'conflito';
  end if;
  begin
    update public.payments set provider_payment_ref = p_payment_ref, provider_charge_ref = p_charge_ref where id = pay.id;
  exception when unique_violation then
    return 'duplicada';
  end;
  return 'registrada';
end $$;

-- Confirmados/estornados do Stripe ainda sem referências (histórico e falhas passadas): a rotina completa depois.
create or replace function public.payments_missing_provider_refs(p_limit integer default 25)
returns table (id uuid, provider text, provider_ref text, stripe_account_id text, identity_strict boolean, status text, member_due_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  return query
    select p.id, p.provider, p.provider_ref, p.stripe_account_id, p.identity_strict, p.status::text, p.member_due_id
      from public.payments p
     where p.status::text in ('confirmado', 'estornado') and p.provider = 'stripe'
       and p.provider_ref is not null and p.stripe_account_id is not null and p.provider_charge_ref is null
     order by p.id
     limit greatest(least(coalesce(p_limit, 25), 200), 1);
end $$;

-- Detecção (somente leitura): a 0065 + 'sem_referencia_cobranca'.
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
    select 'sem_referencia_cobranca', p.id, null, p.provider_ref, 'confirmado sem PaymentIntent/Charge registrados há mais de 1 h', min(l.created_at)
      from public.payments p join public.ledger_entries l on l.payment_id = p.id and l.entry_type = 'bruto'
     where p.provider = 'stripe' and p.status in ('confirmado', 'estornado') and p.provider_charge_ref is null
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

revoke all on function public.record_provider_refs_for(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.payments_missing_provider_refs(integer) from public, anon, authenticated;
revoke all on function public.payments_provider_anomalies(integer) from public, anon, authenticated;
grant execute on function public.record_provider_refs_for(uuid, text, text, text, text, text) to service_role;
grant execute on function public.payments_missing_provider_refs(integer) to service_role;
grant execute on function public.payments_provider_anomalies(integer) to service_role;

-- FIM DO PASSO 10
