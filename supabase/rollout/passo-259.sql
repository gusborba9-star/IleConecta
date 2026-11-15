-- PASSO 259: 0123_desconto_pontualidade_pix — parte 2 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) Quanto de desconto e até quando (só com o desconto ligado)
create or replace function public.platform_pix_discount(p_amount bigint, p_due date, out cents bigint, out until_on date)
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config() -> 'pix_discount'; pct int; ends int; d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
cents := 0; until_on := null;
if cfg is null or coalesce((cfg ->> 'enabled')::boolean, false) is not true or p_amount is null or p_due is null then return; end if;
pct := (cfg ->> 'pct')::int; ends := (cfg ->> 'ends_days_before')::int;
if (p_due - ends) < d then return; end if;
cents := round(p_amount * pct / 100.0)::bigint;
if cents < 1 or p_amount - cents < 100 then cents := 0; return; end if;
until_on := p_due - ends;
end $$;

revoke all on function public.platform_pix_discount(bigint, date) from public, anon, authenticated;

-- ============ 4) Emitir a fatura: a mensalidade do plano guarda o desconto do Pix (e a notificação já o cita)
create or replace function public.platform_charge_issue(p_house uuid, p_kind text, p_item_key text, p_amount bigint, p_due date, p_period_start date, p_description text, p_idem text, p_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; ex public.platform_charges; disc record;
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
if p_kind = 'plan' and p_description = 'Mensalidade do plano' then
select * into disc from public.platform_pix_discount(p_amount, p_due);
if disc.cents > 0 then update public.platform_charges set pix_discount_cents = disc.cents, pix_discount_until = disc.until_on where id = v_id; end if;
end if;
perform public.platform_billing_notice(v_id, 'fatura_disponivel');
return v_id;
end $$;

-- ============ 5) Valor a pagar agora, por meio (a função de cobrança consulta aqui; o valor nunca vem de fora)
create or replace function public.platform_charge_payable(p_charge uuid, p_method text, p_now timestamptz default now())
returns bigint language plpgsql stable security definer set search_path = public as $$
declare c public.platform_charges; d date := (p_now at time zone 'America/Sao_Paulo')::date;
begin
select * into c from public.platform_charges where id = p_charge;
if not found then raise exception 'Fatura inexistente.'; end if;
if p_method = 'pix' and c.status in ('aberta','vencida') and c.pix_discount_cents > 0 and c.pix_discount_until is not null and d <= c.pix_discount_until then
return c.amount_cents - c.pix_discount_cents;
end if;
return c.amount_cents;
end $$;

revoke all on function public.platform_charge_payable(uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.platform_charge_payable(uuid, text, timestamptz) to service_role;
