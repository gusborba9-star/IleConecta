-- PASSO 1 de 18: 0064 a: trava de eventos, identidade
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ 1) trava de eventos com dono ============
alter table public.stripe_events add column if not exists locked_until timestamptz;
alter table public.stripe_events add column if not exists attempts integer not null default 0;
alter table public.stripe_events add column if not exists lease_token uuid;

drop function if exists public.acquire_stripe_event(text, text, text, jsonb, integer);
drop function if exists public.finish_stripe_event(text, text, text);
drop function if exists public.payments_missing_processor_fee(integer);

-- Um único INSERT ... ON CONFLICT DO UPDATE ... WHERE decide. outcome: 'acquired' (lease_token identifica o dono),
-- 'done' (já concluído) ou 'busy' (outro worker detém a trava vigente).
create or replace function public.acquire_stripe_event(
  p_id text, p_type text, p_account text, p_payload jsonb, p_lease_seconds integer default 120
) returns table (outcome text, lease_token uuid) language plpgsql security definer set search_path = public as $$
declare got uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_id is null or p_id = '' then raise exception 'Evento sem identificador.'; end if;
  insert into public.stripe_events as e (id, type, account_id, payload, locked_until, attempts, lease_token)
  values (p_id, coalesce(p_type, ''), p_account, p_payload,
          now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 5)), 1, gen_random_uuid())
  on conflict (id) do update
     set locked_until = excluded.locked_until, attempts = e.attempts + 1, lease_token = excluded.lease_token
   where e.processed_at is null and (e.locked_until is null or e.locked_until < now())
  returning e.lease_token into got;
  if got is not null then return query select 'acquired'::text, got; return; end if;
  if exists (select 1 from public.stripe_events where id = p_id and processed_at is not null) then
    return query select 'done'::text, null::uuid; return;
  end if;
  return query select 'busy'::text, null::uuid;
end $$;

-- Só o dono atual da trava (token igual) pode concluir, rejeitar ou liberar. Devolve false quando não é o dono
-- (a lease venceu e outro worker assumiu, ou o evento já foi concluído): nada é alterado.
create or replace function public.finish_stripe_event(p_id text, p_token uuid, p_outcome text, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_token is null then return false; end if;
  if p_outcome = 'done' then
    update public.stripe_events set processed_at = now(), error = null, locked_until = null
     where id = p_id and lease_token = p_token and processed_at is null;
  elsif p_outcome = 'rejected' then
    update public.stripe_events set processed_at = now(), error = left('rejeitado: ' || coalesce(p_error, ''), 500), locked_until = null
     where id = p_id and lease_token = p_token and processed_at is null;
  elsif p_outcome = 'retry' then
    update public.stripe_events set error = left(coalesce(p_error, ''), 500), locked_until = null
     where id = p_id and lease_token = p_token and processed_at is null;
  else
    raise exception 'Resultado inválido.';
  end if;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ============ 3) identidade estrita (histórico marcado explicitamente) ============
-- identity_strict = true  : a transação só confirma/lança tarifa com provedor, referência E conta de origem iguais às registradas.
-- identity_strict = false : SOMENTE histórico Stripe que já tinha referência e nunca teve conta registrada (anterior a este controle).
-- Linhas novas nascem estritas. A marcação do histórico roda uma única vez (junto com a criação da coluna).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = 'identity_strict') then
    alter table public.payments add column identity_strict boolean not null default true;
    update public.payments set identity_strict = false
     where provider = 'stripe' and stripe_account_id is null and provider_ref is not null;
  end if;
end $$;

-- Mesmo critério para confirmar e para lançar tarifa.
create or replace function public.payment_identity_matches(p public.payments, p_provider text, p_ref text, p_account text)
returns boolean language sql immutable set search_path = public as $$
  select p.provider is not distinct from p_provider
     and p.provider_ref is not null and p.provider_ref is not distinct from p_ref
     and case when p.stripe_account_id is not null then p.stripe_account_id is not distinct from p_account
              else p.identity_strict = false end
$$;

-- FIM DO PASSO 1
