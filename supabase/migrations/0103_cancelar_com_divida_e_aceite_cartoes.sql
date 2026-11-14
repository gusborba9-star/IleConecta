-- 0103 — Cancelar com fatura vencida, reativar só quitando e aceite obrigatório da cobrança automática.
-- Decisões do proprietário com o parecer do advogado (13/11/2026):
--  (1) a casa pode cancelar mesmo com fatura vencida: as cobranças futuras param, mas a fatura vencida NÃO é cancelada (continua aberta e exigível);
--  (2) a conta inativa só reativa depois de quitar a fatura vencida (cobrança imediata do plano, sem período grátis);
--  (3) cobrança automática só com aceite registrado: cartões salvos antes da regra (sem registro) têm a cobrança automática desligada e a casa é avisada.
-- Segue valendo: cancelamento recusado com pagamento em processamento ou reembolso do plano em andamento.

-- ============ 1) quanto a casa deve (faturas de plano/vagas vencidas, fora a de reativação) ============
create or replace function public.platform_house_overdue_cents(p_house uuid, p_today date)
returns bigint language sql stable security definer set search_path = public as $$
select coalesce(sum(c.amount_cents), 0)::bigint from public.platform_charges c
where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.idempotency_key not like 'reativacao:%'
and (c.status = 'vencida' or (c.status = 'aberta' and c.due_date < p_today));
$$;

create or replace function public.billing_money_br(p_cents bigint) returns text
language sql immutable set search_path = public as $$
select 'R$ ' || replace(to_char(coalesce(p_cents, 0) / 100.0, 'FM9999990.00'), '.', ',');
$$;

-- ============ 2) cancelar não depende mais de fatura em dia ============
create or replace function public.platform_cancel_block_reason(p_house uuid, p_today date)
returns text language plpgsql stable security definer set search_path = public as $$
declare st public.house_billing_state;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return 'A cobrança da plataforma ainda não está ativa.'; end if;
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return 'A casa não tem assinatura ativa.'; end if;
select * into st from public.house_billing_state where house_id = p_house;
if found and st.cancelled_at is not null then return 'A assinatura já está cancelada.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
return 'Há um pagamento em processamento. Aguarde a confirmação para cancelar.';
end if;
if exists (select 1 from public.platform_plan_refunds r where r.house_id = p_house and r.status = 'pendente') then
return 'Há um reembolso do plano em andamento.';
end if;
return null;
end $$;

-- encerra a assinatura: faturas ainda NÃO vencidas são canceladas; as vencidas continuam abertas (a dívida não some com o cancelamento)
create or replace function public.platform_house_cancel_apply(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_debt bigint; v_text text;
begin
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then return false; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then return false; end if;
v_debt := public.platform_house_overdue_cents(p_house, v_day);
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind in ('plan', 'extra_seat') and status = 'aberta' and due_date >= v_day;
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = p_house and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (p_house, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, cancel_at = null, cancel_charges = '{}', updated_at = now();
perform public.platform_house_billing_recompute(p_house, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_cancelada', 'processado', p_house::text);
select owner_id into v_owner from public.houses where id = p_house;
if v_owner is not null then
v_text := 'Assinatura cancelada. A casa está inativa e nenhuma nova cobrança será feita. Seus dados ficam guardados.';
if v_debt > 0 then
v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto e precisa ser paga para reativar a conta.';
else
v_text := v_text || ' Para voltar, entre na sua conta e escolha um plano.';
end if;
insert into public.notifications (user_id, text, href) values (v_owner, v_text, '/planos');
end if;
return true;
end $$;

create or replace function public.my_cancel_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'can_cancel', false); end if;
select * into st from public.house_billing_state where house_id = h;
v_reason := public.platform_cancel_block_reason(h, d);
return jsonb_build_object('has_house', true,
'scheduled', st.cancel_at is not null and st.cancelled_at is null, 'cancel_at', case when st.cancelled_at is null then st.cancel_at end,
'can_cancel', v_reason is null and not coalesce(st.cancel_at is not null, false), 'reason', case when st.cancel_at is not null and st.cancelled_at is null then null else v_reason end,
'next_renewal', public.platform_house_next_renewal(h, d),
'debt_cents', public.platform_house_overdue_cents(h, d));
end $$;

create or replace function public.my_cancel_subscription(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text; v_next date; v_ids uuid[]; v_text text; v_debt bigint;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
if p_mode is null or p_mode not in ('agora', 'vencimento') then raise exception 'Escolha como quer cancelar.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa pode cancelar a assinatura.'; end if;
perform 1 from public.house_billing_plan where house_id = h and active for update;
select * into st from public.house_billing_state where house_id = h for update;
if found and st.cancel_at is not null and st.cancelled_at is null then raise exception 'O cancelamento já está agendado para %.', to_char(st.cancel_at, 'DD/MM/YYYY'); end if;
v_reason := public.platform_cancel_block_reason(h, d);
if v_reason is not null then raise exception '%', v_reason; end if;
v_debt := public.platform_house_overdue_cents(h, d);
v_next := public.platform_house_next_renewal(h, d);
if p_mode = 'agora' or v_next is null or v_next <= d then
perform public.platform_house_cancel_apply(h);
return jsonb_build_object('mode', 'agora', 'cancel_at', null, 'debt_cents', v_debt);
end if;
with u as (update public.platform_charges set status = 'cancelada' where house_id = h and kind in ('plan', 'extra_seat') and status = 'aberta' and due_date >= d returning id)
select coalesce(array_agg(id), '{}') into v_ids from u;
insert into public.house_billing_state (house_id, cancel_at, cancel_requested_at, cancel_charges, updated_at) values (h, v_next, now(), v_ids, now())
on conflict (house_id) do update set cancel_at = excluded.cancel_at, cancel_requested_at = excluded.cancel_requested_at, cancel_charges = excluded.cancel_charges, updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'cancelamento_agendado', 'processado', h::text || ':' || v_next);
v_text := 'Cancelamento agendado: você usa a plataforma até ' || to_char(v_next, 'DD/MM/YYYY') || '. Nesse dia a casa fica inativa e nenhuma nova cobrança é feita. Até lá, você pode desfazer em Planos.';
if v_debt > 0 then v_text := v_text || ' A fatura vencida de ' || public.billing_money_br(v_debt) || ' continua em aberto.'; end if;
insert into public.notifications (user_id, text, href) values (me, v_text, '/planos');
return jsonb_build_object('mode', 'vencimento', 'cancel_at', v_next, 'debt_cents', v_debt);
end $$;

-- ============ 3) reativar exige a fatura vencida quitada ============
create or replace function public.platform_reactivation_issue(p_house uuid, p_plan text default null, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan text; v_amt bigint; v_day date := (p_now at time zone 'America/Sao_Paulo')::date; v_open uuid; v_n int; v_id uuid; v_pricing jsonb; v_debt bigint;
begin
perform 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null for update;
if not found then raise exception 'A casa não está cancelada por reembolso.'; end if;
v_debt := public.platform_house_overdue_cents(p_house, v_day);
if v_debt > 0 then raise exception 'Pague a fatura vencida de % antes de reativar a conta.', public.billing_money_br(v_debt); end if;
select coalesce(p_plan, plan::text) into v_plan from public.houses where id = p_house;
if v_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Plano inválido.'; end if;
select value into v_pricing from public.platform_settings where key = 'pricing';
v_amt := case when (v_pricing -> 'plans' -> v_plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((v_pricing -> 'plans' -> v_plan ->> 'monthly')::numeric * 100)::bigint end;
if v_amt is null or v_amt < 100 then raise exception 'Este plano não tem mensalidade para reativar. Fale com o suporte.'; end if;
select id into v_open from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida', 'em_processamento') and amount_cents = v_amt and item_key = 'plan:' || v_plan order by created_at desc limit 1;
if v_open is not null then return v_open; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and idempotency_key like 'reativacao:%' and status in ('aberta', 'vencida');
select count(*) into v_n from public.platform_charges where house_id = p_house and idempotency_key like 'reativacao:%';
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || v_plan, v_amt, v_day, null, 'Reativação do plano', 'reativacao:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reativacao_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;

-- a tela de conta inativa mostra a dívida (a equipe e o dono veem o mesmo estado)
create or replace function public.my_account_gate() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; nm text; r text; v_inactive boolean;
begin
if me is null or public.is_admin() then return jsonb_build_object('state', 'ok'); end if;
select id, name into h, nm from public.houses where owner_id = me limit 1;
if h is not null then
r := 'dono';
else
select s.house_id into h from public.staff_row() s limit 1;
if h is not null then
r := 'equipe';
select name into nm from public.houses where id = h;
end if;
end if;
if h is null or public.house_billing_level(h) <> 'total' then return jsonb_build_object('state', 'ok'); end if;
v_inactive := coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false);
return jsonb_build_object('state', case when v_inactive then 'inativa' else 'bloqueada' end, 'role', r, 'house_id', h, 'house_name', nm,
'debt_cents', case when v_inactive then public.platform_house_overdue_cents(h, (now() at time zone 'America/Sao_Paulo')::date) else 0 end);
end $$;

-- ============ 4) cobrança automática só com aceite registrado ============
-- cartões salvos antes da regra de autorização: desliga a cobrança automática e avisa a casa (ela marca a caixa em Planos para voltar a ligar)
do $$
declare r record;
begin
for r in select f.house_id, h.owner_id from public.house_card_on_file f join public.houses h on h.id = f.house_id
where f.auto_enabled and not exists (select 1 from public.house_auto_authorizations a where a.house_id = f.house_id) loop
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = r.house_id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'auto_sem_aceite_desligada', 'processado', r.house_id::text);
if r.owner_id is not null then
insert into public.notifications (user_id, text, href) values (r.owner_id, 'Para continuar com a cobrança automática no cartão, confirme a autorização em Planos (marque a caixa de autorização). Até lá, as faturas são pagas por Pix ou cartão a cada vencimento.', '/planos');
end if;
end loop;
end $$;

-- defesa extra: mesmo que alguém ligue a cobrança sem passar pelo fluxo, a rotina só cobra casa com aceite registrado
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

-- ============ 5) permissões ============
revoke all on function public.platform_house_overdue_cents(uuid, date), public.billing_money_br(bigint), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz),
public.platform_reactivation_issue(uuid, text, timestamptz), public.platform_autocharge_due(timestamptz) from public, anon, authenticated;
grant execute on function public.platform_house_overdue_cents(uuid, date), public.billing_money_br(bigint), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz),
public.platform_reactivation_issue(uuid, text, timestamptz), public.platform_autocharge_due(timestamptz) to service_role;
grant execute on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_account_gate() to authenticated;
