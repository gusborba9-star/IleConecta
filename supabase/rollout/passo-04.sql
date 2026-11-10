-- PASSO 4 de 18: 0064 d: tarifa do processador
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ 4) tarifa do processador por ID ============
-- Mesmo efeito de record_processor_fee (idempotente por processor_fee_cents), mas sobre a linha travada e validada por id.
-- Devolve 'registrada', 'ja_registrada' ou 'divergente'.
create or replace function public.record_processor_fee_for(
  p_payment uuid, p_provider text, p_provider_ref text, p_account text, p_fee_cents bigint, p_method text default null
) returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype; hid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_fee_cents is null or p_fee_cents < 0 then raise exception 'Tarifa inválida.'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then return 'divergente'; end if;
  if not public.payment_identity_matches(pay, p_provider, p_provider_ref, p_account) then return 'divergente'; end if;
  if p_method in ('pix', 'card') and pay.payment_method is distinct from p_method then
    update public.payments set payment_method = p_method where id = pay.id;
  end if;
  if pay.processor_fee_cents is not null then return 'ja_registrada'; end if;
  update public.payments set processor_fee_cents = p_fee_cents where id = pay.id;
  select coalesce(e.house_id, o.house_id) into hid
    from public.payments p
    left join public.reservations r on r.id = p.reservation_id
    left join public.events e on e.id = r.event_id
    left join public.service_orders o on o.id = p.order_id
   where p.id = pay.id;
  if hid is not null then
    insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
    values (pay.id, hid, 'taxa_provedor', p_fee_cents, pay.fee_rule_version, 'Tarifa do Stripe (cobrada da casa)');
  end if;
  return 'registrada';
end $$;

-- Confirmados sem tarifa conciliada (a rotina tenta de novo).
create or replace function public.payments_missing_processor_fee(p_limit integer default 25)
returns table (id uuid, provider text, provider_ref text, stripe_account_id text, identity_strict boolean, status text, member_due_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  return query
    select p.id, p.provider, p.provider_ref, p.stripe_account_id, p.identity_strict, p.status::text, p.member_due_id
      from public.payments p
     where p.status = 'confirmado' and p.processor_fee_cents is null
       and p.provider = 'stripe' and p.provider_ref is not null and p.stripe_account_id is not null
     order by p.id
     limit greatest(least(coalesce(p_limit, 25), 200), 1);
end $$;

-- FIM DO PASSO 4
