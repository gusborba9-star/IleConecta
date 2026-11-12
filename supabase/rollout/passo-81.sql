-- PASSO 81: 0088_cobranca_motor — parte 6 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) avisos (sino da casa; texto sem cobrança de culpa, sem selo) ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
msg := case p_stage
when 'fatura_disponivel' then 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.'
when 'vespera' then 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').'
when 'dia_vencimento' then 'Sua fatura da plataforma vence hoje.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

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
