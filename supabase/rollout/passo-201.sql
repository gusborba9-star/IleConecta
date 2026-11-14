-- PASSO 201: 0108_contratacao_de_plano_no_app — parte 2 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) valor do upgrade: diferença proporcional aos dias que faltam no ciclo ============
create or replace function public.platform_upgrade_quote(p_house uuid, p_plan text, p_today date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h public.houses; bp public.house_billing_plan; v_reason text; v_first public.platform_charges; c0 date; cstart date; cend date; v_old bigint; v_new bigint; v_total int; v_left int; v_amt bigint;
begin
select * into h from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
v_reason := public.platform_plan_change_block_reason(p_house, p_today);
if v_reason is not null then raise exception '%', v_reason; end if;
if p_plan is null or p_plan not in ('intermediario', 'maximo') or public.platform_plan_rank(p_plan) <= public.platform_plan_rank(h.plan::text) then raise exception 'Escolha um plano acima do atual.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.idempotency_key !~ '^(reativacao|assinatura|upgrade):'
and ((c.status in ('aberta', 'em_processamento') and c.period_start >= p_today) or (c.status = 'paga' and c.period_start > p_today))) then
raise exception 'A fatura da próxima renovação já foi gerada. A troca para um plano acima fica disponível depois do vencimento dela.';
end if;
select * into v_first from public.platform_charges where house_id = p_house and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
if found and v_first.status = 'paga' and v_first.paid_at + interval '7 days' >= now() and not public.house_owner_refund_used_before(p_house) then
raise exception 'Nos 7 dias do primeiro pagamento a troca de plano fica indisponível, para preservar o seu direito de reembolso. Depois desse prazo, a troca é liberada.';
end if;
select * into bp from public.house_billing_plan where house_id = p_house and active;
c0 := date_trunc('month', p_today)::date + (bp.billing_day - 1);
if c0 <= p_today then
cstart := c0; cend := (date_trunc('month', p_today) + interval '1 month')::date + (bp.billing_day - 1);
else
cend := c0; cstart := (date_trunc('month', p_today) - interval '1 month')::date + (bp.billing_day - 1);
end if;
v_total := cend - cstart; v_left := cend - p_today;
v_old := public.platform_plan_monthly_cents(h.plan::text, p_today); v_new := public.platform_plan_monthly_cents(p_plan, p_today);
if v_old is null or v_new is null or v_new <= v_old then raise exception 'Este plano não tem mensalidade na tabela.'; end if;
v_amt := round((v_new - v_old)::numeric * v_left / v_total)::bigint;
if v_amt < 100 then raise exception 'A renovação está muito próxima e a diferença fica abaixo do valor mínimo de cobrança. A troca fica disponível depois da renovação.'; end if;
return jsonb_build_object('plan', p_plan, 'amount_cents', v_amt, 'old_cents', v_old, 'new_cents', v_new, 'days_left', v_left, 'days_total', v_total, 'cycle_end', cend);
end $$;

-- ============ 4) emitir a fatura do upgrade (só o servidor; repetir reaproveita a fatura aberta) ============
create or replace function public.platform_upgrade_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; q jsonb; v_open uuid; v_n int; v_id uuid;
begin
perform 1 from public.house_billing_plan where house_id = p_house and active for update;
q := public.platform_upgrade_quote(p_house, p_plan, v_day);
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida') and amount_cents = (q ->> 'amount_cents')::bigint and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'upgrade:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'upgrade:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, (q ->> 'amount_cents')::bigint, v_day, null, 'Upgrade do plano (diferença proporcional)', 'upgrade:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_solicitado', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_house_upgraded_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text := substring(new.item_key from 6); v_cur text; v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'upgrade:%' then return new; end if;
select plan::text into v_cur from public.houses where id = new.house_id;
if v_cur is null or v_plan not in ('intermediario', 'maximo') or public.platform_plan_rank(v_plan) <= public.platform_plan_rank(v_cur) or not exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_pago_sem_efeito', new.id, 'rejeitado', new.house_id::text);
return new;
end if;
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = v_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = new.house_id;
perform set_config('app.admin_plan', 'off', true);
update public.house_billing_plan set pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = new.house_id;
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'upgrade_aplicado', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: seu plano foi atualizado e os novos recursos já estão liberados. O vencimento mensal continua no mesmo dia.', '/planos');
end if;
return new;
end $$;
