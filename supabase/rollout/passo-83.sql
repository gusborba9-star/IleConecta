-- PASSO 83: 0088_cobranca_motor — parte 8 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.platform_charge_confirm(p_provider text, p_ref text, p_paid_cents bigint, p_fee_cents bigint default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
select * into c from public.platform_charges where provider = p_provider and provider_ref = p_ref for update;
if not found then raise exception 'cobranca_desconhecida'; end if;
if c.status in ('paga','estornada') then return jsonb_build_object('charge', c.id, 'already', true); end if;
if c.status = 'cancelada' then raise exception 'cobranca_cancelada'; end if;
if p_paid_cents is distinct from c.amount_cents then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > c.amount_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents where id = c.id;
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

create or replace function public.platform_charge_cancel(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida','em_processamento') then raise exception 'Só faturas em aberto podem ser canceladas.'; end if;
update public.platform_charges set status = 'cancelada' where id = c.id;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_cancel', jsonb_build_object('charge', c.id, 'status', c.status), jsonb_build_object('reason', left(btrim(p_reason), 300)));
perform public.platform_house_billing_recompute(c.house_id);
end $$;
