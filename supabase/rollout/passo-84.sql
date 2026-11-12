-- PASSO 84: 0088_cobranca_motor — parte 9 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) emitir fatura (idempotente; só com a cobrança ligada) ============
create or replace function public.platform_charge_issue(p_house uuid, p_kind text, p_item_key text, p_amount bigint, p_due date, p_period_start date, p_description text, p_idem text, p_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; ex public.platform_charges;
begin
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
if p_kind not in ('plan','extra_seat','credit_pack','highlight','boost') then raise exception 'Tipo de cobrança inválido.'; end if;
if p_amount is null or p_amount not between 100 and 5000000 then raise exception 'Valor da fatura inválido.'; end if;
if p_due is null or p_due < current_date - 400 or p_due > current_date + 400 then raise exception 'Vencimento inválido.'; end if;
if not exists (select 1 from public.houses where id = p_house) then raise exception 'Casa inexistente.'; end if;
insert into public.platform_charges (house_id, kind, item_key, description, amount_cents, period_start, due_date, ref_id, idempotency_key)
values (p_house, p_kind, p_item_key, left(p_description, 200), p_amount, p_period_start, p_due, p_ref, p_idem)
on conflict (idempotency_key) do nothing returning platform_charges.id into v_id;
if v_id is null then
select * into ex from public.platform_charges where idempotency_key = p_idem;
if ex.house_id <> p_house or ex.kind <> p_kind or ex.amount_cents <> p_amount or ex.due_date <> p_due then raise exception 'idempotencia_conflitante'; end if;
return ex.id;
end if;
perform public.platform_billing_notice(v_id, 'fatura_disponivel');
return v_id;
end $$;

-- ============ 8) provedor: guardar a referência (uma vez), andamento do pagamento e confirmação ============
create or replace function public.platform_charge_attach(p_charge uuid, p_provider text, p_ref text, p_method text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.platform_charges;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found then raise exception 'Fatura inexistente.'; end if;
if c.status not in ('aberta','vencida','em_processamento') then raise exception 'Fatura não está em aberto.'; end if;
if c.provider_ref is not null and (c.provider is distinct from p_provider or c.provider_ref is distinct from p_ref) then raise exception 'referencia_ja_definida'; end if;
update public.platform_charges set provider = p_provider, provider_ref = p_ref, provider_method = p_method, checkout_url = p_url where id = p_charge;
end $$;
