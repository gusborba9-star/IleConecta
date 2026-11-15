-- PASSO 260: 0123_desconto_pontualidade_pix — parte 3 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) Guardar a página de pagamento junto com o valor pedido (o desconto só vale para Pix, dentro do prazo)
drop function if exists public.platform_charge_attach(uuid, text, text, text, text);

create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text, p_amount bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; other uuid; v_amount bigint;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida') then raise exception 'Fatura não aceita nova página de pagamento agora.'; end if;
v_amount := coalesce(p_amount, c.amount_cents);
if v_amount <> c.amount_cents then
if not (p_method = 'pix' and c.pix_discount_cents > 0 and v_amount = c.amount_cents - c.pix_discount_cents and c.pix_discount_until is not null and (now() at time zone 'America/Sao_Paulo')::date <= c.pix_discount_until) then
raise exception 'valor_invalido';
end if;
end if;
other := public.platform_charge_of_ref(p_provider, p_ref);
if other is not null and other <> p_charge then raise exception 'referencia_de_outra_fatura'; end if;
insert into public.platform_charge_refs (charge_id, provider, ref, amount_cents) values (p_charge, p_provider, p_ref, v_amount) on conflict (provider, ref) do nothing;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;

revoke all on function public.platform_charge_attach(uuid, text, text, text, text, bigint) from public, anon, authenticated;

grant execute on function public.platform_charge_attach(uuid, text, text, text, text, bigint) to service_role;

-- ============ 7) Valor esperado de uma referência (a confirmação e a função de cobrança usam o mesmo)
create or replace function public.platform_ref_expected(p_provider text, p_ref text)
returns bigint language sql stable security definer set search_path = public as $$
select coalesce((select r.amount_cents from public.platform_charge_refs r where r.provider = p_provider and r.ref = p_ref),
(select c.amount_cents from public.platform_charges c where c.id = public.platform_charge_of_ref(p_provider, p_ref)));
$$;

revoke all on function public.platform_ref_expected(text, text) from public, anon, authenticated;

grant execute on function public.platform_ref_expected(text, text) to service_role;

-- ============ 8) Confirmação: aceita só o valor pedido naquela referência
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
if p_paid_cents is distinct from public.platform_ref_expected(p_provider, p_ref) then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > p_paid_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents, paid_ref = p_ref where id = c.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'receita', p_paid_cents);
if p_fee_cents is not null and p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
if c.kind = 'credit_pack' then
insert into public.ai_credit_packs (house_id, charge_id, size, remaining, purchased_at, expires_at)
values (c.house_id, c.id, (regexp_replace(c.item_key, '^p', ''))::int, (regexp_replace(c.item_key, '^p', ''))::int, now(), now() + interval '3 months') on conflict (charge_id) do nothing;
end if;
if c.kind in ('boost','highlight') and c.ref_id is not null then
update public.boosts set paid = true where id = c.ref_id and house_id = c.house_id;
end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return jsonb_build_object('charge', c.id, 'already', false, 'house', c.house_id);
end $$;
