-- PASSO 96: 0089_cobranca_tentativas_e_card — parte 5 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) tarifa conhecida só depois do pagamento: grava uma vez (desconhecida continua nula, nunca zero) ============
create or replace function public.platform_charge_record_fee(p_provider text, p_ref text, p_fee_cents bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; v_id uuid;
begin
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status <> 'paga' or c.paid_ref is distinct from p_ref or c.processor_fee_cents is not null then return false; end if;
if p_fee_cents is null or p_fee_cents < 0 or p_fee_cents > c.amount_cents then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set processor_fee_cents = p_fee_cents where id = c.id;
if p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
return true;
end $$;

-- ============ 6) card de aviso da casa: só existe enquanto houver fatura em atraso ============
create or replace function public.my_house_billing_status(p_house uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (now() at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); lvl text; s public.house_billing_state; items jsonb;
begin
if not (public.is_admin() or public.is_house_owner(p_house)) then raise exception 'not_allowed' using errcode = '42501'; end if;
lvl := public.house_billing_level(p_house);
select * into s from public.house_billing_state where house_id = p_house;
select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'description', c.description, 'amount_cents', c.amount_cents, 'due_date', c.due_date, 'status', c.status,
'tolerance_end', public.billing_add_business_days(c.due_date, tol), 'total_on', public.billing_add_business_days(c.due_date, tol) + tdays + 1) order by c.due_date), '[]'::jsonb)
into items from public.platform_charges c where c.house_id = p_house and c.status in ('aberta','vencida','em_processamento') and c.due_date < d;
return jsonb_build_object('level', lvl, 'overdue', jsonb_array_length(items) > 0, 'charges', items, 'partial_since', s.since, 'total_since', s.total_since);
end $$;
