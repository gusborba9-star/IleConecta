-- PASSO 319: 0153_tarifa_do_stripe_nas_mensalidades — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0153 — Tarifa do Stripe das mensalidades de membros entra no livro-caixa da casa.
-- Achado no teste de carga do dia de mensalidades (17/11/2026): record_processor_fee_for descobria a casa só por ritual ou serviço; para pagamento
-- de mensalidade a casa vinha vazia, a tarifa ficava gravada no pagamento mas não virava lançamento "taxa_provedor" (o painel financeiro mostrava 0 de tarifa).
-- Regra do proprietário: nas compras cliente→casa a casa arca com a tarifa do Stripe. Pode rodar de novo sem problema.
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
  select coalesce(e.house_id, o.house_id, md.house_id) into hid
    from public.payments p
    left join public.reservations r on r.id = p.reservation_id
    left join public.events e on e.id = r.event_id
    left join public.service_orders o on o.id = p.order_id
    left join public.member_dues md on md.id = p.member_due_id
   where p.id = pay.id;
  if hid is not null then
    insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
    values (pay.id, hid, 'taxa_provedor', p_fee_cents, pay.fee_rule_version, 'Tarifa do Stripe (cobrada da casa)');
  end if;
  return 'registrada';
end $$;

-- Mensalidades já confirmadas com tarifa gravada e sem o lançamento (em produção não havia nenhuma; vale para qualquer ambiente).
insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
select p.id, md.house_id, 'taxa_provedor', p.processor_fee_cents, p.fee_rule_version, 'Tarifa do Stripe (cobrada da casa)'
  from public.payments p
  join public.member_dues md on md.id = p.member_due_id
 where p.status = 'confirmado' and p.processor_fee_cents is not null
   and not exists (select 1 from public.ledger_entries l where l.payment_id = p.id and l.entry_type = 'taxa_provedor');
