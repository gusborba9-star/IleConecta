-- 0099 — Reativação da casa cancelada por reembolso: a própria casa reativa pagando (o suporte segue podendo reativar no painel).
-- Decisão do proprietário (2026-11-13). Reativar é uma nova contratação: a casa paga a mensalidade do plano atual; ao pagar, volta sozinha e é matriculada de novo.
-- A casa escolhe o plano em que volta (qualquer plano com mensalidade na tabela); ao pagar, o plano da casa passa a ser o escolhido.
-- Não existe segundo reembolso de 7 dias (o direito é único por casa e este pagamento não é o primeiro).
-- Estado de produção antes desta migration: nenhuma fatura de reativação existe.

-- ============ 1) fatura de reativação não gera lembretes de cobrança ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date; f public.house_card_on_file; auto boolean := false;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
-- fatura de reativação é pedida pela própria casa na hora: sem lembretes de fatura
if c.idempotency_key like 'reativacao:%' then return false; end if;
insert into public.platform_billing_notices (charge_id, house_id, stage) values (c.id, c.house_id, p_stage) on conflict do nothing;
get diagnostics n = row_count;
if n = 0 then return false; end if;
select owner_id into owner from public.houses where id = c.house_id;
if owner is null then return true; end if;
tol_end := public.billing_add_business_days(c.due_date, (public.platform_billing_config() ->> 'tolerance_business_days')::int);
select * into f from public.house_card_on_file where house_id = c.house_id;
auto := found and f.auto_enabled and f.method_ref is not null and c.kind in ('plan', 'extra_seat') and c.due_date >= f.saved_on and public.billing_auto_card_enabled()
and not exists (select 1 from public.platform_auto_attempts t where t.charge_id = c.id and t.outcome in ('recusada', 'exige_acao'));
msg := case p_stage
when 'fatura_disponivel' then case when auto then 'Sua fatura da plataforma vence em ' || to_char(c.due_date, 'DD/MM') || ' e será cobrada automaticamente no cartão final ' || coalesce(f.last4, '') || ' nesse dia. Você pode pagar antes ou trocar o cartão em Planos.'
else 'Sua fatura da plataforma está disponível e vence em ' || to_char(c.due_date, 'DD/MM') || '.' end
when 'vespera' then case when auto then 'Amanhã (' || to_char(c.due_date, 'DD/MM') || ') cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '. Confira se o cartão está dentro da validade e com limite.'
else 'Sua fatura da plataforma vence amanhã (' || to_char(c.due_date, 'DD/MM') || ').' end
when 'dia_vencimento' then case when auto then 'Hoje cobramos a fatura da plataforma no cartão final ' || coalesce(f.last4, '') || '.' else 'Sua fatura da plataforma vence hoje.' end
when 'suspensao' then 'Sua casa está com a suspensão parcial: sem vendas novas, campanhas, destaque, impulsionamento e assistente. Pague a fatura para voltar ao normal.'
when 'total_em_breve' then 'Atenção: se a fatura da plataforma continuar em aberto, sua casa será bloqueada por completo em ' || to_char(tol_end + public.billing_total_days() + 1, 'DD/MM') || '. Pague para evitar.'
else 'Pague a fatura e evite a suspensão parcial: a tolerância vai até ' || to_char(tol_end, 'DD/MM') || '.' end;
insert into public.notifications (user_id, text, href) values (owner, msg, '/planos');
return true;
end $$;

-- ============ 1b) a cobrança automática do cartão nunca puxa uma fatura de reativação esquecida em aberto ============
create or replace function public.platform_autocharge_due(p_now timestamptz default now())
returns table (charge_id uuid, house_id uuid, attempt int, amount_cents bigint, due_date date, provider text, customer_ref text, method_ref text, last4 text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; a record; n int;
begin
if not public.billing_auto_card_enabled() then return; end if;
for r in
select c.id, c.house_id as hid, c.amount_cents as amt, c.due_date as due, f.provider as prov, f.customer_ref as cust, f.method_ref as meth, f.last4 as l4
from public.platform_charges c join public.house_card_on_file f on f.house_id = c.house_id
where c.status in ('aberta', 'vencida') and c.kind in ('plan', 'extra_seat') and c.idempotency_key not like 'reativacao:%' and f.auto_enabled and f.method_ref is not null and c.due_date >= f.saved_on
and c.due_date <= d order by c.due_date, c.id
loop
select * into a from public.platform_auto_attempts t where t.charge_id = r.id order by t.attempt desc limit 1;
if not found then
n := 1;
elsif a.outcome = 'iniciada' then
n := a.attempt;
elsif a.outcome in ('recusada', 'exige_acao') then
-- depois de uma recusa, a próxima tentativa só vale em outro dia
if (a.updated_at at time zone 'America/Sao_Paulo')::date >= d then continue; end if;
n := a.attempt + 1;
else
continue; -- aprovada ou em processamento: aguarda a confirmação
end if;
if n > public.billing_auto_max_attempts() then continue; end if;
if d < r.due + (n - 1) then continue; end if;
charge_id := r.id; house_id := r.hid; attempt := n; amount_cents := r.amt; due_date := r.due; provider := r.prov; customer_ref := r.cust; method_ref := r.meth; last4 := r.l4;
return next;
end loop;
end $$;

-- ============ 2) emitir a fatura de reativação (só o servidor; repetir reaproveita a fatura aberta) ============
create or replace function public.platform_reactivation_issue(p_house uuid, p_plan text default null, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan text; v_amt bigint; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_open uuid; v_n int; v_id uuid; v_pricing jsonb;
begin
perform 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null for update;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
select coalesce(p_plan, plan::text) into v_plan from public.houses where id = p_house;
if v_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Plano inválido.'; end if;
select value into v_pricing from public.platform_settings where key = 'pricing';
v_amt := case when (v_pricing -> 'plans' -> v_plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((v_pricing -> 'plans' -> v_plan ->> 'monthly')::numeric * 100)::bigint end;
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade para reativar. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida', 'em_processamento') and amount_cents = v_amt and item_key = 'plan:' || v_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || v_plan, v_amt, v_day, v_day, 'Reativação do plano', 'reativacao:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reativacao_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

-- ============ 3) fatura de reativação paga: a casa volta e é matriculada de novo (uma vez; repetir não duplica) ============
create or replace function public.platform_house_reactivated_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date := (coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo')::date; v_owner uuid; v_plan text := substring(new.item_key from 6);
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'reativacao:%' then return new; end if;
update public.house_billing_state set cancelled_at = null, updated_at = now() where house_id = new.house_id and cancelled_at is not null;
if not found then return new; end if;
if v_plan in ('base', 'intermediario', 'maximo') then
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = v_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = new.house_id and plan::text is distinct from v_plan;
perform set_config('app.admin_plan', 'off', true);
end if;
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (new.house_id, least(extract(day from v_day)::int, 28), v_day, true)
on conflict (house_id) do update set active = true, billing_day = excluded.billing_day, started_on = excluded.started_on, updated_at = now();
perform public.platform_house_billing_recompute(new.house_id);
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'casa_reativada_pagamento', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: sua casa foi reativada e a cobrança mensal do plano voltou a valer. A cobrança automática no cartão fica desligada até você ligar de novo em Planos.', '/planos');
end if;
return new;
end $$;

drop trigger if exists trg_platform_house_reactivated on public.platform_charges;

create trigger trg_platform_house_reactivated after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_house_reactivated_by_payment();

-- ============ 4) reativação pelo suporte também encerra uma fatura de reativação que ficou aberta ============
create or replace function public.admin_billing_reactivate(p_house uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
update public.house_billing_state set cancelled_at = null, updated_at = now() where house_id = p_house and cancelled_at is not null;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida');
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_reactivate', null, jsonb_build_object('house', p_house, 'reason', left(btrim(p_reason), 300)));
perform public.platform_house_billing_recompute(p_house);
end $$;

-- ============ 5) permissões ============
revoke all on function public.platform_reactivation_issue(uuid, text, timestamptz), public.platform_house_reactivated_by_payment() from public, anon, authenticated;

grant execute on function public.platform_reactivation_issue(uuid, text, timestamptz) to service_role;

revoke all on function public.admin_billing_reactivate(uuid, text) from public, anon, authenticated;

grant execute on function public.admin_billing_reactivate(uuid, text) to authenticated, service_role;
