-- PASSO 95: 0089_cobranca_tentativas_e_card — parte 4 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_charge_confirm(p_provider text, p_ref text, p_paid_cents bigint, p_fee_cents bigint default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; v_id uuid;
begin
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status in ('paga','estornada') then
if c.paid_ref is distinct from p_ref then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason)
values (p_provider, 'dup:' || p_ref, 'pagamento_duplicado', c.id, 'rejeitado', left('pago antes por ' || coalesce(c.paid_ref, '?') || '; devolver o valor de ' || p_ref, 300)) on conflict do nothing;
return jsonb_build_object('charge', c.id, 'already', true, 'duplicate', true);
end if;
return jsonb_build_object('charge', c.id, 'already', true);
end if;
if c.status = 'cancelada' then raise exception 'cobranca_cancelada'; end if;
if p_paid_cents is distinct from c.amount_cents then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > c.amount_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents, paid_ref = p_ref where id = c.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'receita', p_paid_cents);
if p_fee_cents is not null and p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
if c.kind in ('boost','highlight') and c.ref_id is not null then
update public.boosts set paid = true where id = c.ref_id and house_id = c.house_id;
end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return jsonb_build_object('charge', c.id, 'already', false, 'house', c.house_id);
end $$;
