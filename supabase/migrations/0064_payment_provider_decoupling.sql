-- EXEC-01: desacoplamento do provedor de pagamentos (Stripe segue como único ativo).
-- Idempotente e compatível com o banco real: só ADICIONA colunas/funções/gatilho; não altera confirm_payment,
-- complete_refund, complete_cancel_refund nem record_processor_fee, não mexe em dados e não derruba índices.
--
-- 1) Evento de aviso com trava atômica (dois avisos simultâneos nunca são tratados juntos).
-- 2) Identidade da transação (provedor + referência + conta de origem) conferida no banco antes de confirmar ou lançar tarifa.
-- 3) Tarifa do processador separada da confirmação financeira, com lista do que falta conciliar.
-- 4) Gatilho que impede trocar provedor/conta de uma transação em silêncio.
-- 5) Regra de liquidação por provedor: Stripe = direta (sem retenção/repasse); retenção de 72h fica só para o legado.

-- ============ 1) trava de eventos ============
alter table public.stripe_events add column if not exists locked_until timestamptz;
alter table public.stripe_events add column if not exists attempts integer not null default 0;

-- Devolve 'acquired' (este processo pode tratar), 'done' (já concluído) ou 'busy' (outro processo está tratando).
-- Um único INSERT ... ON CONFLICT DO UPDATE ... WHERE decide: só um dos concorrentes recebe a linha de volta.
create or replace function public.acquire_stripe_event(
  p_id text, p_type text, p_account text, p_payload jsonb, p_lease_seconds integer default 120
) returns text language plpgsql security definer set search_path = public as $$
declare got text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_id is null or p_id = '' then raise exception 'Evento sem identificador.'; end if;
  insert into public.stripe_events as e (id, type, account_id, payload, locked_until, attempts)
  values (p_id, coalesce(p_type, ''), p_account, p_payload, now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 5)), 1)
  on conflict (id) do update
     set locked_until = excluded.locked_until, attempts = e.attempts + 1
   where e.processed_at is null and (e.locked_until is null or e.locked_until < now())
  returning e.id into got;
  if got is not null then return 'acquired'; end if;
  if exists (select 1 from public.stripe_events where id = p_id and processed_at is not null) then return 'done'; end if;
  return 'busy';
end $$;

-- Fecha o evento: done = concluído; rejected = divergência (concluído com o motivo, não adianta reenviar); retry = libera já para nova tentativa.
create or replace function public.finish_stripe_event(p_id text, p_outcome text, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_outcome = 'done' then
    update public.stripe_events set processed_at = now(), error = null, locked_until = null where id = p_id;
  elsif p_outcome = 'rejected' then
    update public.stripe_events set processed_at = now(), error = left('rejeitado: ' || coalesce(p_error, ''), 500), locked_until = null where id = p_id;
  elsif p_outcome = 'retry' then
    update public.stripe_events set error = left(coalesce(p_error, ''), 500), locked_until = null where id = p_id and processed_at is null;
  else
    raise exception 'Resultado inválido.';
  end if;
end $$;

-- ============ 2) identidade da transação ============
-- Devolve 'divergente' quando provedor, referência ou conta não batem com o que está registrado; senão delega ao confirm_payment existente.
create or replace function public.confirm_payment_for(p_payment uuid, p_provider text, p_provider_ref text, p_account text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  select * into pay from public.payments where id = p_payment;
  if not found then return 'divergente'; end if;
  if pay.provider is distinct from p_provider
     or pay.provider_ref is distinct from p_provider_ref
     or (pay.stripe_account_id is not null and pay.stripe_account_id is distinct from p_account) then
    return 'divergente';
  end if;
  return public.confirm_payment(p_provider_ref);
end $$;

-- Tarifa do processador: confere a identidade, grava a forma de pagamento e delega ao record_processor_fee (idempotente).
-- Devolve 'registrada', 'ja_registrada' ou 'divergente'.
create or replace function public.record_processor_fee_for(
  p_payment uuid, p_provider text, p_provider_ref text, p_account text, p_fee_cents bigint, p_method text default null
) returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  select * into pay from public.payments where id = p_payment;
  if not found then return 'divergente'; end if;
  if pay.provider is distinct from p_provider
     or pay.provider_ref is distinct from p_provider_ref
     or (pay.stripe_account_id is not null and pay.stripe_account_id is distinct from p_account) then
    return 'divergente';
  end if;
  if p_method in ('pix', 'card') then
    update public.payments set payment_method = p_method where id = pay.id and payment_method is distinct from p_method;
  end if;
  if public.record_processor_fee(p_provider_ref, p_fee_cents) then return 'registrada'; end if;
  return 'ja_registrada';
end $$;

-- Confirmados sem tarifa conciliada (a rotina tenta de novo). Só pagamentos de provedor com conta de origem registrada.
create or replace function public.payments_missing_processor_fee(p_limit integer default 25)
returns table (id uuid, provider text, provider_ref text, stripe_account_id text, status text, member_due_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  return query
    select p.id, p.provider, p.provider_ref, p.stripe_account_id, p.status::text, p.member_due_id
      from public.payments p
     where p.status = 'confirmado' and p.processor_fee_cents is null
       and p.provider = 'stripe' and p.provider_ref is not null and p.stripe_account_id is not null
     order by p.id
     limit greatest(least(coalesce(p_limit, 25), 200), 1);
end $$;

-- ============ 4) gatilho de identidade ============
-- provedor nunca muda; a conta de origem, depois de gravada, nunca muda; a referência só muda enquanto o pagamento está pendente
-- (nova sessão de checkout). Não depende de quem escreve: vale para a função de pagamentos e para qualquer outro caminho.
create or replace function public.payments_guard_identity() returns trigger language plpgsql as $$
begin
  if new.provider is distinct from old.provider then
    raise exception 'O provedor de um pagamento não pode ser alterado.' using errcode = '23514';
  end if;
  if old.stripe_account_id is not null and new.stripe_account_id is distinct from old.stripe_account_id then
    raise exception 'A conta de origem de um pagamento não pode ser alterada.' using errcode = '23514';
  end if;
  if old.provider_ref is not null and new.provider_ref is distinct from old.provider_ref and old.status::text <> 'pendente' then
    raise exception 'A referência de um pagamento só muda enquanto ele está pendente.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists payments_guard_identity on public.payments;
create trigger payments_guard_identity before update on public.payments
  for each row execute function public.payments_guard_identity();

-- ============ 5) regra de liquidação por provedor ============
-- 'direct' = cobrança direta (a casa recebe na própria conta; sem retenção de 72h, sem reserva, sem repasse da plataforma).
-- 'legacy_hold' = regra antiga de retenção, preservada só para pagamentos históricos de outros provedores.
create or replace function public.settlement_mode(p_provider text)
returns text language sql immutable set search_path = public as $$
  select case when p_provider = 'stripe' then 'direct' else 'legacy_hold' end
$$;

-- Pagamento Stripe nunca carrega depósito/repasse de retenção. NOT VALID: não reprova histórico, vale para linhas novas e alteradas.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_stripe_no_hold' and conrelid = 'public.payments'::regclass) then
    alter table public.payments
      add constraint payments_stripe_no_hold
      check (provider <> 'stripe' or (escrow_id is null and split_done_at is null)) not valid;
  end if;
end $$;

-- ============ permissões ============
revoke all on function public.acquire_stripe_event(text, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.finish_stripe_event(text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_payment_for(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_processor_fee_for(uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.payments_missing_processor_fee(integer) from public, anon, authenticated;
grant execute on function public.acquire_stripe_event(text, text, text, jsonb, integer) to service_role;
grant execute on function public.finish_stripe_event(text, text, text) to service_role;
grant execute on function public.confirm_payment_for(uuid, text, text, text) to service_role;
grant execute on function public.record_processor_fee_for(uuid, text, text, text, bigint, text) to service_role;
grant execute on function public.payments_missing_processor_fee(integer) to service_role;
grant execute on function public.settlement_mode(text) to service_role;
