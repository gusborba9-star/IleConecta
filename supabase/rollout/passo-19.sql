-- PASSO 19 de 19: 0068 anomalia de referências (só pagamentos novos) e search_path do gatilho
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 0068 — EXEC-02: (1) anomalia 'sem_referencia_cobranca' vale só para pagamentos criados a partir da entrada da 0066
-- (os anteriores não nasceram com PaymentIntent/Charge; a rotina agendada os completa e as demais anomalias seguem valendo
-- para todos); (2) search_path fixo no gatilho payments_guard_identity (aviso do linter). Não altera dados. Idempotente.

alter function public.payments_guard_identity() set search_path = public;

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
       and p.created_at >= timestamptz '2026-11-10 15:00:00+00'  -- anteriores à 0066 não têm referências: a rotina as completa
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

-- FIM DO PASSO 19
