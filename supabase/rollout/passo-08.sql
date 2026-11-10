-- PASSO 8 de 18: 0064 h: gatilho, regra de liquidacao e permissoes
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ 6) gatilho de identidade ============
-- provedor nunca muda; a conta de origem, depois de gravada, nunca muda; identity_strict nunca muda; a referência só muda
-- enquanto o pagamento está pendente (nova sessão de checkout). Vale para qualquer caminho de escrita.
create or replace function public.payments_guard_identity() returns trigger language plpgsql as $$
begin
  if new.provider is distinct from old.provider then
    raise exception 'O provedor de um pagamento não pode ser alterado.' using errcode = '23514';
  end if;
  if old.stripe_account_id is not null and new.stripe_account_id is distinct from old.stripe_account_id then
    raise exception 'A conta de origem de um pagamento não pode ser alterada.' using errcode = '23514';
  end if;
  if new.identity_strict is distinct from old.identity_strict then
    raise exception 'A marcação de identidade de um pagamento não pode ser alterada.' using errcode = '23514';
  end if;
  if old.provider_ref is not null and new.provider_ref is distinct from old.provider_ref and old.status::text <> 'pendente' then
    raise exception 'A referência de um pagamento só muda enquanto ele está pendente.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists payments_guard_identity on public.payments;
create trigger payments_guard_identity before update on public.payments
  for each row execute function public.payments_guard_identity();

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
revoke all on function public.finish_stripe_event(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.confirm_payment_row(uuid) from public, anon, authenticated;
revoke all on function public.confirm_payment(text) from public, anon, authenticated;
revoke all on function public.confirm_payment_for(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_processor_fee_for(uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.payments_missing_processor_fee(integer) from public, anon, authenticated;
revoke all on function public.payment_recorded_amounts(uuid) from public, anon, authenticated;
revoke all on function public.payment_identity_matches(public.payments, text, text, text) from public, anon, authenticated;
grant execute on function public.acquire_stripe_event(text, text, text, jsonb, integer) to service_role;
grant execute on function public.finish_stripe_event(text, uuid, text, text) to service_role;
grant execute on function public.confirm_payment_row(uuid) to service_role;
grant execute on function public.confirm_payment(text) to service_role;
grant execute on function public.confirm_payment_for(uuid, text, text, text) to service_role;
grant execute on function public.record_processor_fee_for(uuid, text, text, text, bigint, text) to service_role;
grant execute on function public.payments_missing_processor_fee(integer) to service_role;
grant execute on function public.payment_recorded_amounts(uuid) to service_role;
grant execute on function public.payment_identity_matches(public.payments, text, text, text) to service_role;
revoke all on function public.settlement_mode(text) from public, anon, authenticated;
revoke all on function public.payments_guard_identity() from public, anon, authenticated;
grant execute on function public.settlement_mode(text) to service_role;

-- FIM DO PASSO 8
