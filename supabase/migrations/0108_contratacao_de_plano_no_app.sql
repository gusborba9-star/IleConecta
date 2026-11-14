-- 0108 — Contratação de plano dentro do app (decisões do proprietário, 14/11/2026).
-- Primeira assinatura (casa no Base ou sem assinatura): paga a mensalidade cheia, o plano muda ao confirmar e o vencimento mensal passa a ser o dia do pagamento.
-- Upgrade: sobe na hora e paga só a diferença proporcional aos dias que faltam no ciclo; o vencimento não muda. Indisponível nos 7 dias do primeiro pagamento (preserva o reembolso)
-- e enquanto a fatura da próxima renovação já estiver gerada (ela foi calculada com o plano atual).
-- Downgrade (e volta ao Base): vale na próxima renovação, sem devolução; a fatura dessa renovação já sai com o valor do plano novo.
-- Faturas de assinatura e de upgrade são pedidas na hora pela própria casa: sem lembretes, nunca puxadas pelo cartão automático, nunca viram atraso
-- (se não forem pagas, são canceladas depois de 2 dias, como as compras avulsas).

-- ============ 1) troca de plano agendada (só descida) ============
alter table public.house_billing_plan add column if not exists pending_plan text;

alter table public.house_billing_plan add column if not exists pending_plan_on date;

alter table public.house_billing_plan drop constraint if exists house_billing_plan_pending_ck;

alter table public.house_billing_plan add constraint house_billing_plan_pending_ck check ((pending_plan is null) = (pending_plan_on is null) and (pending_plan is null or pending_plan in ('base', 'intermediario')));

create or replace function public.platform_plan_rank(p text) returns int
language sql immutable set search_path = public as $$
select case p when 'base' then 0 when 'intermediario' then 1 when 'maximo' then 2 end;
$$;

-- ============ 2) por que a casa não pode trocar de plano agora (null = pode) ============
create or replace function public.platform_plan_change_block_reason(p_house uuid, p_today date)
returns text language plpgsql stable security definer set search_path = public as $$
declare st public.house_billing_state;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return 'A cobrança da plataforma ainda não está ativa.'; end if;
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return 'A casa não tem assinatura ativa.'; end if;
select * into st from public.house_billing_state where house_id = p_house;
if found and (st.cancelled_at is not null or st.cancel_at is not null) then return 'A assinatura está cancelada ou com cancelamento agendado.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and (c.status = 'vencida' or (c.status = 'aberta' and c.due_date < p_today))) then
return 'Há uma fatura em atraso. Regularize o pagamento antes de trocar de plano.';
end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
return 'Há um pagamento em processamento. Aguarde a confirmação para trocar de plano.';
end if;
if exists (select 1 from public.platform_plan_refunds r where r.house_id = p_house and r.status = 'pendente') then
return 'Há um reembolso do plano em andamento.';
end if;
return null;
end $$;

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

drop trigger if exists trg_platform_house_upgraded on public.platform_charges;

create trigger trg_platform_house_upgraded after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_house_upgraded_by_payment();

-- ============ 5) primeira assinatura (casa sem assinatura ativa): vence no dia do pagamento ============
create or replace function public.platform_subscribe_issue(p_house uuid, p_plan text, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_amt bigint; v_open uuid; v_n int; v_id uuid;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then raise exception 'A cobrança da plataforma ainda não está ativa.'; end if;
perform 1 from public.houses where id = p_house for update;
if not found then raise exception 'Casa inexistente.'; end if;
if p_plan is null or p_plan not in ('intermediario', 'maximo') then raise exception 'Escolha um plano com mensalidade.'; end if;
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then raise exception 'A assinatura está cancelada. Use a reativação da casa.'; end if;
if exists (select 1 from public.house_billing_plan where house_id = p_house and active) then raise exception 'A casa já tem assinatura ativa. Use a troca de plano.'; end if;
v_amt := public.platform_plan_monthly_cents(p_plan, v_day);
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade na tabela. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida') and amount_cents = v_amt and item_key = 'plan:' || p_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
if exists (select 1 from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%' and status = 'em_processamento') then raise exception 'Há um pagamento em processamento. Aguarde a confirmação.'; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'assinatura:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'assinatura:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || p_plan, v_amt, v_day, null, 'Assinatura do plano', 'assinatura:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

create or replace function public.platform_house_subscribed_by_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date := (coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo')::date; v_plan text := substring(new.item_key from 6); v_owner uuid;
begin
if new.status <> 'paga' or old.status = 'paga' or new.idempotency_key not like 'assinatura:%' then return new; end if;
if v_plan not in ('intermediario', 'maximo') or exists (select 1 from public.house_billing_plan where house_id = new.house_id and active) or exists (select 1 from public.house_billing_state where house_id = new.house_id and cancelled_at is not null) then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_paga_sem_efeito', new.id, 'rejeitado', new.house_id::text);
return new;
end if;
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = v_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = new.house_id;
perform set_config('app.admin_plan', 'off', true);
insert into public.house_billing_plan (house_id, billing_day, started_on, active) values (new.house_id, least(extract(day from v_day)::int, 28), v_day, true)
on conflict (house_id) do update set active = true, billing_day = excluded.billing_day, started_on = excluded.started_on, pending_plan = null, pending_plan_on = null, updated_at = now();
perform public.platform_house_billing_recompute(new.house_id);
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_ativada', new.id, 'processado', new.house_id::text);
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Pagamento confirmado: seu plano está ativo e a cobrança mensal passa a vencer neste mesmo dia. A cobrança automática no cartão fica desligada até você ligar em Planos.', '/planos');
end if;
return new;
end $$;

drop trigger if exists trg_platform_house_subscribed on public.platform_charges;

create trigger trg_platform_house_subscribed after update of status on public.platform_charges
for each row when (new.status = 'paga' and old.status is distinct from 'paga')
execute function public.platform_house_subscribed_by_payment();

-- ============ 6) descer de plano: vale na renovação, sem devolução ============
create or replace function public.platform_plan_pending_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0; v_owner uuid;
begin
for r in select house_id, pending_plan from public.house_billing_plan where active and pending_plan is not null and pending_plan_on <= d order by pending_plan_on loop
begin
perform set_config('app.admin_plan', 'on', true);
update public.houses set plan = r.pending_plan::public.house_plan, plan_revert_to = null, plan_revert_at = null where id = r.house_id;
perform set_config('app.admin_plan', 'off', true);
if r.pending_plan = 'base' then
update public.house_billing_plan set active = false, pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = r.house_id;
update public.platform_charges set status = 'cancelada' where house_id = r.house_id and kind in ('plan', 'extra_seat') and status = 'aberta';
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = r.house_id and auto_enabled;
else
update public.house_billing_plan set pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = r.house_id;
end if;
perform public.platform_house_billing_recompute(r.house_id, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'plano_reduzido', 'processado', r.house_id::text || ':' || r.pending_plan);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, case when r.pending_plan = 'base' then 'Sua casa voltou ao plano Base, como você pediu. Nenhuma nova mensalidade será cobrada. Para voltar a um plano pago, escolha em Planos.' else 'Seu plano foi alterado na renovação, como você pediu.' end, '/planos');
end if;
n := n + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_reducao_plano', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

create or replace function public.my_plan_change_schedule(p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; bp public.house_billing_plan; v_reason text; c date;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then raise exception 'Só a casa pode trocar de plano.'; end if;
select * into bp from public.house_billing_plan where house_id = h.id and active for update;
v_reason := public.platform_plan_change_block_reason(h.id, d);
if v_reason is not null then raise exception '%', v_reason; end if;
if p_plan is null or p_plan not in ('base', 'intermediario') or public.platform_plan_rank(p_plan) >= public.platform_plan_rank(h.plan::text) then raise exception 'Escolha um plano abaixo do atual.'; end if;
c := date_trunc('month', d)::date + (bp.billing_day - 1);
if c <= d then c := (date_trunc('month', d) + interval '1 month')::date + (bp.billing_day - 1); end if;
if exists (select 1 from public.platform_charges where house_id = h.id and kind = 'plan' and idempotency_key = 'plan:' || h.id || ':' || c and status <> 'cancelada') then c := (c + interval '1 month')::date; end if;
update public.house_billing_plan set pending_plan = p_plan, pending_plan_on = c, updated_at = now() where house_id = h.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_plano_agendada', 'processado', h.id::text || ':' || p_plan || ':' || c);
insert into public.notifications (user_id, text, href) values (me, 'Troca de plano agendada: você mantém o plano atual até ' || to_char(c, 'DD/MM/YYYY') || ' e, nessa renovação, passa para o plano escolhido. Até lá, pode desfazer em Planos.', '/planos');
return jsonb_build_object('plan', p_plan, 'effective_on', c);
end $$;

create or replace function public.my_plan_change_undo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; bp public.house_billing_plan;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa pode trocar de plano.'; end if;
select * into bp from public.house_billing_plan where house_id = h and active for update;
if not found or bp.pending_plan is null then raise exception 'Não há troca de plano agendada.'; end if;
if exists (select 1 from public.platform_charges where house_id = h and kind = 'plan' and idempotency_key = 'plan:' || h || ':' || bp.pending_plan_on and status <> 'cancelada') then
raise exception 'A fatura da renovação com o novo plano já foi gerada. Não é mais possível desfazer.';
end if;
update public.house_billing_plan set pending_plan = null, pending_plan_on = null, updated_at = now() where house_id = h;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reducao_plano_desfeita', 'processado', h::text);
return jsonb_build_object('ok', true);
end $$;

-- o que a casa vê em Planos: plano, troca agendada e o valor de cada upgrade (ou o motivo de não estar disponível)
create or replace function public.my_plan_change_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.houses; d date := (now() at time zone 'America/Sao_Paulo')::date; bp public.house_billing_plan; p text; ups jsonb := '{}'::jsonb; blk jsonb := '{}'::jsonb; v_reason text; canc boolean;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select * into h from public.houses where owner_id = me limit 1;
if not found then return jsonb_build_object('has_house', false); end if;
select coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h.id), false) into canc;
select * into bp from public.house_billing_plan where house_id = h.id and active;
if not found then return jsonb_build_object('has_house', true, 'subscribed', false, 'cancelled', canc, 'plan', h.plan::text); end if;
v_reason := public.platform_plan_change_block_reason(h.id, d);
foreach p in array array['intermediario', 'maximo'] loop
continue when public.platform_plan_rank(p) <= public.platform_plan_rank(h.plan::text);
begin
ups := ups || jsonb_build_object(p, public.platform_upgrade_quote(h.id, p, d));
exception when others then
blk := blk || jsonb_build_object(p, sqlerrm);
end;
end loop;
return jsonb_build_object('has_house', true, 'subscribed', true, 'cancelled', canc, 'plan', h.plan::text, 'pending_plan', bp.pending_plan, 'pending_on', bp.pending_plan_on,
'upgrades', ups, 'upgrade_blocked', blk, 'downgrade_blocked', v_reason);
end $$;

-- ============ 7) fatura de assinatura/upgrade esquecida em aberto: sem lembretes, sem cartão automático, sem atraso ============
create or replace function public.platform_billing_notice(p_charge uuid, p_stage text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; owner uuid; n bigint; msg text; tol_end date; f public.house_card_on_file; auto boolean := false;
begin
select * into c from public.platform_charges where id = p_charge;
if not found or c.status not in ('aberta','vencida','em_processamento') then return false; end if;
-- fatura de reativação, assinatura ou upgrade é pedida pela própria casa na hora: sem lembretes de fatura
if c.idempotency_key ~ '^(reativacao|assinatura|upgrade):' then return false; end if;
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

create or replace function public.platform_autocharge_due(p_now timestamptz default now())
returns table (charge_id uuid, house_id uuid, attempt int, amount_cents bigint, due_date date, provider text, customer_ref text, method_ref text, last4 text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; a record; n int;
begin
if not public.billing_auto_card_enabled() then return; end if;
for r in
select c.id, c.house_id as hid, c.amount_cents as amt, c.due_date as due, f.provider as prov, f.customer_ref as cust, f.method_ref as meth, f.last4 as l4
from public.platform_charges c join public.house_card_on_file f on f.house_id = c.house_id
where c.status in ('aberta', 'vencida') and c.kind in ('plan', 'extra_seat') and c.idempotency_key !~ '^(reativacao|assinatura|upgrade):' and f.auto_enabled and f.method_ref is not null and c.due_date >= f.saved_on
and exists (select 1 from public.house_auto_authorizations z where z.house_id = c.house_id)
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

create or replace function public.platform_house_next_renewal(p_house uuid, p_today date)
returns date language plpgsql stable security definer set search_path = public as $$
declare v date; pl public.house_billing_plan; c date;
begin
select min(period_start) into v from public.platform_charges where house_id = p_house and kind = 'plan' and status = 'aberta' and period_start >= p_today and idempotency_key !~ '^(reativacao|assinatura|upgrade):';
if v is not null then return v; end if;
select * into pl from public.house_billing_plan where house_id = p_house and active;
if not found then return null; end if;
c := date_trunc('month', p_today)::date + (pl.billing_day - 1);
if c <= p_today then c := (date_trunc('month', p_today) + interval '1 month')::date + (pl.billing_day - 1); end if;
return c;
end $$;

-- a rotina diária aplica a descida de plano agendada e emite a renovação com o plano certo
create or replace function public.platform_billing_tick(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare eff text; cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; nd int; tol int; tdays int := public.billing_total_days(); nday int := (public.platform_billing_config() ->> 'notice_days')::int; total_on date; pricing jsonb; prices jsonb;
h record; c record; m int; cand date; due date; amt bigint; seats int; issued int := 0; late int := 0; notices int := 0; houses int := 0; tol_end date;
begin
if coalesce((cfg ->> 'enabled')::boolean, false) is not true then return jsonb_build_object('skipped', 'cobranca_desligada'); end if;
nd := (cfg ->> 'notice_days')::int; tol := (cfg ->> 'tolerance_business_days')::int;
select value into pricing from public.platform_settings where key = 'pricing';
prices := public.platform_billing_prices();
perform public.platform_plan_pending_apply_due(p_now);
for h in select p.house_id, p.billing_day, p.started_on, hs.plan::text as plan, p.pending_plan, p.pending_plan_on from public.house_billing_plan p join public.houses hs on hs.id = p.house_id where p.active and not exists (select 1 from public.house_billing_state bs where bs.house_id = p.house_id and bs.cancel_at is not null) loop
begin
for m in -1..1 loop
cand := (date_trunc('month', d)::date + make_interval(months => m))::date + (h.billing_day - 1);
continue when cand - nd < h.started_on or cand < d - 31;
due := greatest(cand, d + nd);
eff := case when h.pending_plan is not null and cand >= h.pending_plan_on then h.pending_plan else h.plan end;
amt := public.platform_plan_monthly_cents(eff, due);
if amt is not null and cand - nd <= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'plan:' || h.house_id || ':' || cand) then
perform public.platform_charge_issue(h.house_id, 'plan', 'plan:' || eff, amt, due, cand, 'Mensalidade do plano', 'plan:' || h.house_id || ':' || cand);
issued := issued + 1;
end if;
exception when unique_violation then null;
end;
end if;
select coalesce(s.seats, 0) into seats from public.house_extra_seats s where s.house_id = h.house_id;
amt := case when coalesce(seats, 0) > 0 and (prices -> 'extra_seat' ->> eff) ~ '^[0-9]+$' then seats * (prices -> 'extra_seat' ->> eff)::bigint end;
if amt is not null and cand - nd <= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'extra_seat:' || h.house_id || ':' || cand) then
perform public.platform_charge_issue(h.house_id, 'extra_seat', 'extra_seat', amt, due, cand, 'Vagas adicionais de equipe (' || seats || ')', 'extra_seat:' || h.house_id || ':' || cand);
issued := issued + 1;
end if;
exception when unique_violation then null;
end;
end if;
end loop;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_emissao', 'rejeitado', left(h.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
update public.platform_charges pc set status = 'cancelada' where pc.status in ('aberta','vencida') and not exists (select 1 from public.houses x where x.id = pc.house_id);
update public.platform_charges set status = 'cancelada' where (kind not in ('plan','extra_seat') or idempotency_key ~ '^(assinatura|upgrade):') and status in ('aberta','vencida') and created_at < p_now - interval '2 days';
update public.platform_charges set status = 'vencida' where status = 'aberta' and due_date < d and kind in ('plan','extra_seat') and idempotency_key !~ '^(assinatura|upgrade):';
get diagnostics late = row_count;
for c in select id, due_date from public.platform_charges where status in ('aberta','vencida') and kind in ('plan','extra_seat') loop
begin
tol_end := public.billing_add_business_days(c.due_date, tol);
if public.platform_billing_notice(c.id, 'fatura_disponivel') then notices := notices + 1; end if;
if d >= c.due_date - 1 and d < c.due_date and public.platform_billing_notice(c.id, 'vespera') then notices := notices + 1; end if;
if d >= c.due_date and public.platform_billing_notice(c.id, 'dia_vencimento') then notices := notices + 1; end if;
if d > c.due_date and d <= tol_end and public.platform_billing_notice(c.id, 'tolerancia') then notices := notices + 1; end if;
if d > tol_end and public.platform_billing_notice(c.id, 'suspensao') then notices := notices + 1; end if;
total_on := tol_end + tdays + 1;
if d >= total_on - nday and d < total_on and public.platform_billing_notice(c.id, 'total_em_breve') then notices := notices + 1; end if;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_aviso', c.id, 'rejeitado', left(sqlerrm, 300));
end;
end loop;
for h in select distinct x.house_id from (select house_id from public.platform_charges where status in ('aberta','vencida','em_processamento') union select house_id from public.house_billing_state where suspended) x loop
begin
perform public.platform_house_billing_recompute(h.house_id, p_now);
houses := houses + 1;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_recalculo', 'rejeitado', left(h.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return jsonb_build_object('issued', issued, 'overdue', late, 'notices', notices, 'houses_checked', houses);
end $$;

-- ============ 8) permissões ============
revoke all on function public.platform_plan_rank(text), public.platform_plan_change_block_reason(uuid, date), public.platform_upgrade_quote(uuid, text, date), public.platform_upgrade_issue(uuid, text, timestamptz),
  public.platform_house_upgraded_by_payment(), public.platform_subscribe_issue(uuid, text, timestamptz), public.platform_house_subscribed_by_payment(), public.platform_plan_pending_apply_due(timestamptz),
  public.my_plan_change_schedule(text), public.my_plan_change_undo(), public.my_plan_change_status() from public, anon, authenticated;

grant execute on function public.platform_upgrade_issue(uuid, text, timestamptz), public.platform_subscribe_issue(uuid, text, timestamptz), public.platform_plan_pending_apply_due(timestamptz) to service_role;

grant execute on function public.my_plan_change_schedule(text), public.my_plan_change_undo(), public.my_plan_change_status() to authenticated, service_role;
