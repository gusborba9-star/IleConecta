-- 0101 — Cancelamento da assinatura pela casa e tela única de conta bloqueada/inativa.
-- Decisões do proprietário (13/11/2026): a casa cancela quando quiser, escolhendo "usar até o vencimento" (no dia a casa fica inativa e não é
-- cobrada de novo; até lá pode desfazer) ou "cancelar agora" (inativa na hora, sem devolução; dentro dos 7 dias do primeiro pagamento vale o reembolso).
-- Cancelar não apaga dívida: com fatura em atraso o cancelamento é recusado. Bloqueio total e conta inativa levam a uma tela única (no app); aqui
-- ficam o estado da conta e a trava no servidor: casa em bloqueio total não grava mais nada de casa (posts, serviços, campanhas, equipe etc.).

-- ============ 1) cancelamento agendado ============
alter table public.house_billing_state add column if not exists cancel_at date;

alter table public.house_billing_state add column if not exists cancel_requested_at timestamptz;

alter table public.house_billing_state add column if not exists cancel_charges uuid[] not null default '{}';

-- ============ 2) funções internas ============
-- próxima renovação da casa: a fatura de plano ainda em aberto que vem pela frente, ou o próximo dia de cobrança depois de hoje
create or replace function public.platform_house_next_renewal(p_house uuid, p_today date)
returns date language plpgsql stable security definer set search_path = public as $$
declare v date; pl public.house_billing_plan; c date;
begin
select min(period_start) into v from public.platform_charges where house_id = p_house and kind = 'plan' and status = 'aberta' and period_start >= p_today and idempotency_key not like 'reativacao:%';
if v is not null then return v; end if;
select * into pl from public.house_billing_plan where house_id = p_house and active;
if not found then return null; end if;
c := date_trunc('month', p_today)::date + (pl.billing_day - 1);
if c <= p_today then c := (date_trunc('month', p_today) + interval '1 month')::date + (pl.billing_day - 1); end if;
return c;
end $$;

-- por que a casa não pode cancelar agora (null = pode)
create or replace function public.platform_cancel_block_reason(p_house uuid, p_today date)
returns text language plpgsql stable security definer set search_path = public as $$
declare st public.house_billing_state;
begin
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return 'A cobrança da plataforma ainda não está ativa.'; end if;
if not exists (select 1 from public.house_billing_plan where house_id = p_house and active) then return 'A casa não tem assinatura ativa.'; end if;
select * into st from public.house_billing_state where house_id = p_house;
if found and st.cancelled_at is not null then return 'A assinatura já está cancelada.'; end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and (c.status = 'vencida' or (c.status = 'aberta' and c.due_date < p_today))) then
return 'Há uma fatura em atraso. Regularize o pagamento antes de cancelar ou fale com a administração.';
end if;
if exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan', 'extra_seat') and c.status = 'em_processamento') then
return 'Há um pagamento em processamento. Aguarde a confirmação para cancelar.';
end if;
if exists (select 1 from public.platform_plan_refunds r where r.house_id = p_house and r.status = 'pendente') then
return 'Há um reembolso do plano em andamento.';
end if;
return null;
end $$;

-- encerra a assinatura (mesmo estado final do reembolso do plano): cobrança mensal e cartão automático param, faturas ainda não vencidas são canceladas e a casa fica inativa
create or replace function public.platform_house_cancel_apply(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
if exists (select 1 from public.house_billing_state where house_id = p_house and cancelled_at is not null) then return false; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = p_house and active;
if not found then return false; end if;
update public.platform_charges set status = 'cancelada' where house_id = p_house and kind in ('plan', 'extra_seat') and status = 'aberta';
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = p_house and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (p_house, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, cancel_at = null, cancel_charges = '{}', updated_at = now();
perform public.platform_house_billing_recompute(p_house, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'assinatura_cancelada', 'processado', p_house::text);
select owner_id into v_owner from public.houses where id = p_house;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Assinatura cancelada. A casa está inativa e nenhuma nova cobrança será feita. Seus dados ficam guardados. Para voltar, entre na sua conta e escolha um plano.', '/planos');
end if;
return true;
end $$;

-- no dia agendado, a casa fica inativa
create or replace function public.platform_cancel_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; r record; n integer := 0;
begin
for r in select house_id from public.house_billing_state where cancel_at is not null and cancel_at <= d and cancelled_at is null order by cancel_at loop
begin
if public.platform_house_cancel_apply(r.house_id, p_now) then n := n + 1; end if;
exception when others then
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'erro_cancelamento', 'rejeitado', left(r.house_id::text || ': ' || sqlerrm, 300));
end;
end loop;
return n;
end $$;

-- ============ 3) o que a própria casa vê e faz ============
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
'next_renewal', public.platform_house_next_renewal(h, d));
end $$;

create or replace function public.my_cancel_subscription(p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; v_reason text; v_next date; v_ids uuid[]; v_text text;
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
v_next := public.platform_house_next_renewal(h, d);
if p_mode = 'agora' or v_next is null or v_next <= d then
perform public.platform_house_cancel_apply(h);
return jsonb_build_object('mode', 'agora', 'cancel_at', null);
end if;
with u as (update public.platform_charges set status = 'cancelada' where house_id = h and kind in ('plan', 'extra_seat') and status = 'aberta' returning id)
select coalesce(array_agg(id), '{}') into v_ids from u;
insert into public.house_billing_state (house_id, cancel_at, cancel_requested_at, cancel_charges, updated_at) values (h, v_next, now(), v_ids, now())
on conflict (house_id) do update set cancel_at = excluded.cancel_at, cancel_requested_at = excluded.cancel_requested_at, cancel_charges = excluded.cancel_charges, updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'cancelamento_agendado', 'processado', h::text || ':' || v_next);
v_text := 'Cancelamento agendado: você usa a plataforma até ' || to_char(v_next, 'DD/MM/YYYY') || '. Nesse dia a casa fica inativa e nenhuma nova cobrança é feita. Até lá, você pode desfazer em Planos.';
insert into public.notifications (user_id, text, href) values (me, v_text, '/planos');
return jsonb_build_object('mode', 'vencimento', 'cancel_at', v_next);
end $$;

create or replace function public.my_cancel_undo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; d date := (now() at time zone 'America/Sao_Paulo')::date; st public.house_billing_state; c public.platform_charges; n int := 0;
begin
if me is null then raise exception 'Entre na sua conta.'; end if;
select id into h from public.houses where owner_id = me limit 1;
if h is null then raise exception 'Só a casa pode desfazer o cancelamento.'; end if;
select * into st from public.house_billing_state where house_id = h for update;
if not found or st.cancel_at is null or st.cancelled_at is not null then raise exception 'Não há cancelamento agendado.'; end if;
if st.cancel_at <= d then raise exception 'O cancelamento vale a partir de hoje e não pode mais ser desfeito.'; end if;
-- a fatura do próximo ciclo foi cancelada ao agendar e o sistema não reabre fatura cancelada: reemite uma cópia (mesmo valor e vencimento)
for c in select * from public.platform_charges where id = any (st.cancel_charges) and status = 'cancelada' order by created_at loop
perform public.platform_charge_issue(c.house_id, c.kind, c.item_key, c.amount_cents, c.due_date, c.period_start, c.description, left(c.idempotency_key, 100) || ':' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
n := n + 1;
end loop;
update public.house_billing_state set cancel_at = null, cancel_requested_at = null, cancel_charges = '{}', updated_at = now() where house_id = h;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'cancelamento_desfeito', 'processado', h::text);
insert into public.notifications (user_id, text, href) values (me, 'Cancelamento desfeito: a sua assinatura continua normalmente.', '/planos');
return jsonb_build_object('reissued', n);
end $$;

-- ============ 4) a rotina diária não emite fatura nova para casa com cancelamento agendado ============
create or replace function public.platform_billing_tick(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; nd int; tol int; tdays int := public.billing_total_days(); nday int := (public.platform_billing_config() ->> 'notice_days')::int; total_on date; pricing jsonb; prices jsonb;
h record; c record; m int; cand date; due date; amt bigint; seats int; issued int := 0; late int := 0; notices int := 0; houses int := 0; tol_end date;
begin
if coalesce((cfg ->> 'enabled')::boolean, false) is not true then return jsonb_build_object('skipped', 'cobranca_desligada'); end if;
nd := (cfg ->> 'notice_days')::int; tol := (cfg ->> 'tolerance_business_days')::int;
select value into pricing from public.platform_settings where key = 'pricing';
prices := public.platform_billing_prices();
for h in select p.house_id, p.billing_day, p.started_on, hs.plan::text as plan from public.house_billing_plan p join public.houses hs on hs.id = p.house_id where p.active and not exists (select 1 from public.house_billing_state bs where bs.house_id = p.house_id and bs.cancel_at is not null) loop
begin
for m in -1..1 loop
cand := (date_trunc('month', d)::date + make_interval(months => m))::date + (h.billing_day - 1);
continue when cand - nd < h.started_on or cand < d - 31;
due := greatest(cand, d + nd);
amt := public.platform_plan_monthly_cents(h.plan, due);
if amt is not null and cand - nd <= d then
begin
if not exists (select 1 from public.platform_charges where idempotency_key = 'plan:' || h.house_id || ':' || cand) then
perform public.platform_charge_issue(h.house_id, 'plan', 'plan:' || h.plan, amt, due, cand, 'Mensalidade do plano', 'plan:' || h.house_id || ':' || cand);
issued := issued + 1;
end if;
exception when unique_violation then null;
end;
end if;
select coalesce(s.seats, 0) into seats from public.house_extra_seats s where s.house_id = h.house_id;
amt := case when coalesce(seats, 0) > 0 and (prices -> 'extra_seat' ->> h.plan) ~ '^[0-9]+$' then seats * (prices -> 'extra_seat' ->> h.plan)::bigint end;
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
update public.platform_charges set status = 'cancelada' where kind not in ('plan','extra_seat') and status in ('aberta','vencida') and created_at < p_now - interval '2 days';
update public.platform_charges set status = 'vencida' where status = 'aberta' and due_date < d and kind in ('plan','extra_seat');
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

-- ============ 5) reembolso do plano: mesmo fim de assinatura, aviso aponta a tela de conta inativa ============
create or replace function public.platform_plan_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.platform_plan_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.platform_plan_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.platform_plan_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
update public.house_billing_plan set active = false, updated_at = now() where house_id = r.house_id and active;
update public.platform_charges set status = 'cancelada' where house_id = r.house_id and kind in ('plan', 'extra_seat') and status in ('aberta', 'vencida');
update public.house_card_on_file set auto_enabled = false, updated_at = now() where house_id = r.house_id and auto_enabled;
insert into public.house_billing_state (house_id, suspended, since, total, total_since, cancelled_at, updated_at) values (r.house_id, true, p_now, true, p_now, p_now, now())
on conflict (house_id) do update set cancelled_at = excluded.cancelled_at, cancel_at = null, cancel_charges = '{}', updated_at = now();
perform public.platform_house_billing_recompute(r.house_id, p_now);
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'plano_reembolsado', 'processado', r.house_id::text);
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: a assinatura do plano foi cancelada e as cobranças mensais pararam. O dinheiro volta pelo mesmo meio de pagamento em alguns dias. Seus dados ficam guardados. Para voltar, entre na sua conta e escolha um plano na tela de conta inativa.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

-- ============ 6) estado da conta para a tela única (dono ou equipe da casa) ============
create or replace function public.my_account_gate() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); h uuid; nm text; r text;
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
return jsonb_build_object('state', case when coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false) then 'inativa' else 'bloqueada' end, 'role', r, 'house_id', h, 'house_name', nm);
end $$;

-- ============ 7) trava no servidor: casa em bloqueio total não grava mais nada da casa ============
create or replace function public.house_write_locked(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select h is not null and not public.is_admin() and public.house_billing_level(h) = 'total';
$$;

do $$
declare t text;
begin
foreach t in array array['assistants', 'boosts', 'events', 'house_availability', 'house_blocks', 'house_campaigns', 'house_catalog_items', 'house_quick_replies', 'house_staff', 'house_staff_invites', 'posts', 'services', 'stories'] loop
execute format('drop policy if exists billing_lock_ins on public.%I', t);
execute format('create policy billing_lock_ins on public.%I as restrictive for insert to authenticated with check (not public.house_write_locked(house_id))', t);
execute format('drop policy if exists billing_lock_upd on public.%I', t);
execute format('create policy billing_lock_upd on public.%I as restrictive for update to authenticated using (not public.house_write_locked(house_id)) with check (not public.house_write_locked(house_id))', t);
execute format('drop policy if exists billing_lock_del on public.%I', t);
execute format('create policy billing_lock_del on public.%I as restrictive for delete to authenticated using (not public.house_write_locked(house_id))', t);
end loop;
end $$;

-- ============ 8) agenda: aplica cancelamentos vencidos (de hora em hora, pela data de Brasília) ============
select cron.unschedule('platform-cancel-apply') where exists (select 1 from cron.job where jobname = 'platform-cancel-apply');

select cron.schedule('platform-cancel-apply', '25 * * * *', $job$ select public.platform_cancel_apply_due() $job$);

-- ============ 9) permissões ============
revoke all on function public.platform_house_next_renewal(uuid, date), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz), public.platform_cancel_apply_due(timestamptz) from public, anon, authenticated;

grant execute on function public.platform_house_next_renewal(uuid, date), public.platform_cancel_block_reason(uuid, date), public.platform_house_cancel_apply(uuid, timestamptz), public.platform_cancel_apply_due(timestamptz) to service_role;

revoke all on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_cancel_undo(), public.my_account_gate(), public.house_write_locked(uuid) from public, anon;

grant execute on function public.my_cancel_status(), public.my_cancel_subscription(text), public.my_cancel_undo(), public.my_account_gate(), public.house_write_locked(uuid) to authenticated, service_role;
