-- Fase 4: créditos de IA (Blueprint §18.3). Pacotes de 80, 200 e 500 respostas, validade de 3 meses, sem devolução, consumo da franquia mensal primeiro e depois do pacote mais antigo,
-- débito único por resposta, avisos aos 80% e 100% da franquia. Compra pela cobrança da plataforma (migrations 0088 a 0090). Nada aqui liga a cobrança: sem billing_config.enabled a compra é recusada.
-- Também corrige um defeito do motor antes da primeira venda avulsa: compra instantânea (créditos, e no futuro destaque e impulsionamento) abandonada não pode virar atraso, aviso nem suspensão.
-- Só mensalidade e vagas extras (kinds 'plan' e 'extra_seat') contam para tolerância, avisos e suspensão. Compra avulsa abandonada é cancelada depois de 2 dias (a página de pagamento dura menos de 24 horas).
-- Estado de produção antes desta migration: nenhuma fatura existe e nenhum pacote existe.

-- ============ 1) pacotes e livro de consumo ============
create table if not exists public.ai_credit_packs (
id uuid primary key default gen_random_uuid(),
house_id uuid not null,
charge_id uuid not null unique references public.platform_charges(id) on delete restrict,
size int not null check (size in (80, 200, 500)),
remaining int not null check (remaining >= 0),
purchased_at timestamptz not null default now(),
expires_at timestamptz not null,
created_at timestamptz not null default now(),
check (remaining <= size),
check (expires_at > purchased_at)
);

create index if not exists ai_credit_packs_house on public.ai_credit_packs (house_id, purchased_at) where remaining > 0;

create table if not exists public.ai_credit_ledger (
id bigint generated always as identity primary key,
house_id uuid not null,
pack_id uuid not null references public.ai_credit_packs(id) on delete restrict,
usage_id uuid not null unique,
created_at timestamptz not null default now()
);

alter table public.ai_credit_packs enable row level security;

alter table public.ai_credit_ledger enable row level security;

drop policy if exists acp_read on public.ai_credit_packs;

create policy acp_read on public.ai_credit_packs for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists acl_read on public.ai_credit_ledger;

create policy acl_read on public.ai_credit_ledger for select to authenticated using (public.is_admin());

drop trigger if exists trg_ai_credit_ledger_immutable on public.ai_credit_ledger;

create trigger trg_ai_credit_ledger_immutable before update or delete on public.ai_credit_ledger
for each row execute function public.platform_billing_immutable();

create or replace function public.ai_credit_packs_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Pacote de créditos não pode ser apagado.'; end if;
if new.id is distinct from old.id or new.house_id is distinct from old.house_id or new.charge_id is distinct from old.charge_id or new.size is distinct from old.size
or new.purchased_at is distinct from old.purchased_at or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at then
raise exception 'Pacote de créditos não pode ser alterado.';
end if;
if new.remaining > old.remaining then raise exception 'O saldo do pacote só diminui.'; end if;
return new;
end $$;

drop trigger if exists trg_ai_credit_packs_guard on public.ai_credit_packs;

create trigger trg_ai_credit_packs_guard before update or delete on public.ai_credit_packs
for each row execute function public.ai_credit_packs_guard();

-- fatura de pacote estornada pelo provedor: o saldo que sobrou deixa de valer
create or replace function public.ai_credit_packs_on_refund() returns trigger
language plpgsql security definer set search_path = public as $$
begin
if new.kind = 'credit_pack' and new.status = 'estornada' and old.status is distinct from 'estornada' then
update public.ai_credit_packs set remaining = 0 where charge_id = new.id;
end if;
return new;
end $$;

drop trigger if exists trg_platform_charges_credit_refund on public.platform_charges;

create trigger trg_platform_charges_credit_refund after update of status on public.platform_charges
for each row execute function public.ai_credit_packs_on_refund();

-- ============ 2) compra avulsa não conta para atraso, aviso nem suspensão ============
create or replace function public.platform_house_billing_recompute(p_house uuid, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); late boolean; fully boolean; proc boolean; susp boolean; tot boolean; was boolean; wast boolean;
begin
if not exists (select 1 from public.houses where id = p_house) then return false; end if;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) < d) into late;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida') and public.billing_add_business_days(c.due_date, tol) + tdays < d) into fully;
select exists (select 1 from public.platform_charges c where c.house_id = p_house and c.kind in ('plan','extra_seat') and c.status = 'em_processamento') into proc;
susp := coalesce((cfg ->> 'enabled')::boolean, false) and late and not proc;
tot := susp and fully;
select suspended, total into was, wast from public.house_billing_state where house_id = p_house;
if was is distinct from susp or wast is distinct from tot then
if susp or was is not null then
insert into public.house_billing_state (house_id, suspended, since, total, total_since, updated_at) values (p_house, susp, case when susp then p_now end, tot, case when tot then p_now end, now())
on conflict (house_id) do update set suspended = excluded.suspended, total = excluded.total,
since = case when excluded.suspended and house_billing_state.suspended then house_billing_state.since else excluded.since end,
total_since = case when excluded.total and house_billing_state.total then house_billing_state.total_since else excluded.total_since end,
updated_at = now();
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason)
values ('sistema', gen_random_uuid()::text, case when tot and not coalesce(wast, false) then 'casa_bloqueio_total' when susp and not coalesce(was, false) then 'casa_suspensa' when susp then 'casa_volta_parcial' else 'casa_reativada' end, 'processado', p_house::text);
end if;
end if;
return susp;
end $$;

create or replace function public.platform_billing_tick(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.platform_billing_config(); d date := (p_now at time zone 'America/Sao_Paulo')::date; nd int; tol int; tdays int := public.billing_total_days(); nday int := (public.platform_billing_config() ->> 'notice_days')::int; total_on date; pricing jsonb; prices jsonb;
h record; c record; m int; cand date; due date; amt bigint; seats int; issued int := 0; late int := 0; notices int := 0; houses int := 0; tol_end date;
begin
if coalesce((cfg ->> 'enabled')::boolean, false) is not true then return jsonb_build_object('skipped', 'cobranca_desligada'); end if;
nd := (cfg ->> 'notice_days')::int; tol := (cfg ->> 'tolerance_business_days')::int;
select value into pricing from public.platform_settings where key = 'pricing';
prices := public.platform_billing_prices();
for h in select p.house_id, p.billing_day, p.started_on, hs.plan::text as plan from public.house_billing_plan p join public.houses hs on hs.id = p.house_id where p.active loop
begin
for m in -1..1 loop
cand := (date_trunc('month', d)::date + make_interval(months => m))::date + (h.billing_day - 1);
continue when cand - nd < h.started_on or cand < d - 31;
due := greatest(cand, d + nd);
amt := case when (pricing -> 'plans' -> h.plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((pricing -> 'plans' -> h.plan ->> 'monthly')::numeric * 100)::bigint end;
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

create or replace function public.my_house_billing_status(p_house uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p_h uuid := p_house; cfg jsonb := public.platform_billing_config(); d date := (now() at time zone 'America/Sao_Paulo')::date; tol int := (cfg ->> 'tolerance_business_days')::int; tdays int := public.billing_total_days(); lvl text; s public.house_billing_state; items jsonb;
begin
if p_h is null then select id into p_h from public.houses where owner_id = auth.uid() limit 1; end if;
if p_h is null then return jsonb_build_object('house_id', null, 'level', 'ok', 'overdue', false, 'charges', '[]'::jsonb); end if;
if not (public.is_admin() or public.is_house_owner(p_h)) then raise exception 'not_allowed' using errcode = '42501'; end if;
lvl := public.house_billing_level(p_h);
select * into s from public.house_billing_state where house_id = p_h;
select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'description', c.description, 'amount_cents', c.amount_cents, 'due_date', c.due_date, 'status', c.status, 'methods', coalesce(cfg -> 'methods' -> c.kind, '[]'::jsonb),
'tolerance_end', public.billing_add_business_days(c.due_date, tol), 'total_on', public.billing_add_business_days(c.due_date, tol) + tdays + 1) order by c.due_date), '[]'::jsonb)
into items from public.platform_charges c where c.house_id = p_h and c.kind in ('plan','extra_seat') and c.status in ('aberta','vencida','em_processamento') and c.due_date < d;
return jsonb_build_object('house_id', p_h, 'level', lvl, 'overdue', jsonb_array_length(items) > 0, 'charges', items, 'partial_since', s.since, 'total_since', s.total_since);
end $$;


-- ============ 3) pacote entra no saldo no instante da confirmação do pagamento ============
create or replace function public.platform_charge_confirm(p_provider text, p_ref text, p_paid_cents bigint, p_fee_cents bigint default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; v_id uuid;
begin
v_id := public.platform_charge_of_ref(p_provider, p_ref);
if v_id is null then raise exception 'cobranca_desconhecida'; end if;
select * into c from public.platform_charges where id = v_id for update;
if c.status in ('paga','estornada') then
if c.paid_ref is distinct from p_ref then
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason)
values (p_provider, 'dup:' || p_ref, 'pagamento_duplicado', c.id, 'rejeitado', left('pago antes por ' || coalesce(c.paid_ref, '?') || '; devolver o valor de ' || p_ref, 300)) on conflict do nothing;
return jsonb_build_object('charge', c.id, 'already', true, 'duplicate', true);
end if;
return jsonb_build_object('charge', c.id, 'already', true);
end if;
if c.status = 'cancelada' then raise exception 'cobranca_cancelada'; end if;
if p_paid_cents is distinct from c.amount_cents then raise exception 'valor_divergente'; end if;
if p_fee_cents is not null and (p_fee_cents < 0 or p_fee_cents > c.amount_cents) then raise exception 'tarifa_invalida'; end if;
update public.platform_charges set status = 'paga', paid_at = now(), paid_amount_cents = p_paid_cents, processor_fee_cents = p_fee_cents, paid_ref = p_ref where id = c.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'receita', p_paid_cents);
if p_fee_cents is not null and p_fee_cents > 0 then
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (c.id, c.house_id, 'taxa_provedor', p_fee_cents);
end if;
if c.kind = 'credit_pack' then
insert into public.ai_credit_packs (house_id, charge_id, size, remaining, purchased_at, expires_at)
values (c.house_id, c.id, (regexp_replace(c.item_key, '^p', ''))::int, (regexp_replace(c.item_key, '^p', ''))::int, now(), now() + interval '3 months') on conflict (charge_id) do nothing;
end if;
if c.kind in ('boost','highlight') and c.ref_id is not null then
update public.boosts set paid = true where id = c.ref_id and house_id = c.house_id;
end if;
perform public.platform_house_billing_recompute(c.house_id, p_now);
return jsonb_build_object('charge', c.id, 'already', false, 'house', c.house_id);
end $$;

-- ============ 4) saldo, limite do plano e consumo ============
create or replace function public.ai_credit_balance(p_house uuid) returns int
language sql stable security definer set search_path = public as $$
select coalesce(sum(remaining), 0)::int from public.ai_credit_packs where house_id = p_house and expires_at > now();
$$;

create or replace function public.assistant_monthly_limit(p_plan text) returns int
language sql stable security definer set search_path = public as $$
select coalesce(nullif((public.plan_matrix() -> 'caps' -> p_plan ->> 'assistant_replies'), '')::int, 0);
$$;

-- grava a resposta e debita o crédito na mesma transação, uma vez por resposta; a franquia mensal vem primeiro
create or replace function public.assistant_record_usage(p_house uuid, p_user uuid, p_model text, p_prompt int, p_completion int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_usage uuid; v_plan text; v_owner uuid; v_limit int; v_used int; v_pack public.ai_credit_packs; v_from boolean := false; v_left int; v_thr int;
v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
perform pg_advisory_xact_lock(hashtextextended('assistant_usage:' || p_house::text, 0));
select owner_id, plan::text into v_owner, v_plan from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
v_limit := public.assistant_monthly_limit(v_plan);
insert into public.assistant_usage (house_id, user_id, model, prompt_tokens, completion_tokens)
values (p_house, p_user, p_model, greatest(coalesce(p_prompt, 0), 0), greatest(coalesce(p_completion, 0), 0)) returning id into v_usage;
select count(*) into v_used from public.assistant_usage where house_id = p_house and created_at >= v_month;
if v_limit > 0 and v_used > v_limit then
select * into v_pack from public.ai_credit_packs where house_id = p_house and remaining > 0 and expires_at > now() order by purchased_at, id limit 1 for update;
if found then
update public.ai_credit_packs set remaining = remaining - 1 where id = v_pack.id;
insert into public.ai_credit_ledger (house_id, pack_id, usage_id) values (p_house, v_pack.id, v_usage);
v_from := true;
end if;
end if;
v_left := public.ai_credit_balance(p_house);
if v_owner is not null and v_limit > 0 then
v_thr := ceil(v_limit * 0.8)::int;
if v_thr < v_limit and v_used = v_thr then
insert into public.notifications (user_id, text, href) values (v_owner, 'A assistente já usou 80% das respostas do mês (' || v_used || ' de ' || v_limit || ').', '/planos');
elsif v_used = v_limit then
insert into public.notifications (user_id, text, href) values (v_owner, case when v_left > 0
then 'A franquia de respostas do mês acabou. A assistente continua com os seus créditos (saldo de ' || v_left || ' respostas).'
else 'A franquia de respostas do mês acabou. A assistente pausa até o próximo mês, ou compre um pacote de créditos para continuar.' end, '/planos');
elsif v_from and v_left = 0 then
insert into public.notifications (user_id, text, href) values (v_owner, 'Seus créditos de respostas acabaram. A assistente pausa até o próximo mês, ou compre um novo pacote.', '/planos');
end if;
end if;
return jsonb_build_object('usage_id', v_usage, 'used_month', v_used, 'limit', v_limit, 'from_credit', v_from, 'credits_left', v_left, 'uncovered', v_limit > 0 and v_used > v_limit and not v_from);
end $$;

-- ============ 5) tela da casa: franquia, saldo e preços ============
create or replace function public.my_ai_credit_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; pl text; lim int; used int; v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
select id, plan::text into h, pl from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
lim := public.assistant_monthly_limit(pl);
select count(*) into used from public.assistant_usage where house_id = h and created_at >= v_month;
return jsonb_build_object('has_house', true, 'limit', lim, 'used_month', used, 'balance', public.ai_credit_balance(h),
'packs', coalesce((select jsonb_agg(jsonb_build_object('size', p.size, 'remaining', p.remaining, 'expires_at', p.expires_at) order by p.purchased_at, p.id) from public.ai_credit_packs p where p.house_id = h and p.remaining > 0 and p.expires_at > now()), '[]'::jsonb),
'prices', public.platform_billing_prices() -> 'credit_pack', 'for_sale', coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) and lim > 0);
end $$;

-- ============ 6) compra: valida, usa o preço do painel e reaproveita a fatura aberta (clique repetido não cria outra) ============
create or replace function public.platform_credit_purchase(p_house uuid, p_pack text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_price bigint; v_id uuid; v_size int; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
if p_pack not in ('p80', 'p200', 'p500') then raise exception 'Pacote inválido.'; end if;
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
perform pg_advisory_xact_lock(hashtextextended('credit_purchase:' || p_house::text, 0));
select plan::text into v_plan from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
if public.assistant_monthly_limit(v_plan) <= 0 then raise exception 'O plano da casa não inclui a assistente.'; end if;
if public.house_billing_level(p_house) <> 'ok' then raise exception 'Regularize a fatura em atraso para comprar créditos.'; end if;
v_price := (public.platform_billing_prices() -> 'credit_pack' ->> p_pack)::bigint;
v_size := (regexp_replace(p_pack, '^p', ''))::int;
select id into v_id from public.platform_charges where house_id = p_house and kind = 'credit_pack' and item_key = p_pack and amount_cents = v_price and status in ('aberta', 'vencida') and created_at > now() - interval '1 day' order by created_at desc limit 1;
if v_id is not null then return v_id; end if;
return public.platform_charge_issue(p_house, 'credit_pack', p_pack, v_price, v_today, null, 'Pacote de ' || v_size || ' respostas da assistente', 'credit:' || p_house || ':' || gen_random_uuid());
end $$;

-- ============ 7) permissões ============
revoke all on function public.ai_credit_packs_guard(), public.ai_credit_packs_on_refund(), public.ai_credit_balance(uuid), public.assistant_monthly_limit(text), public.assistant_record_usage(uuid, uuid, text, int, int), public.my_ai_credit_status(), public.platform_credit_purchase(uuid, text) from public, anon, authenticated;

grant execute on function public.ai_credit_balance(uuid), public.assistant_monthly_limit(text), public.assistant_record_usage(uuid, uuid, text, int, int), public.platform_credit_purchase(uuid, text) to service_role;

grant execute on function public.my_ai_credit_status() to authenticated, service_role;

revoke all on public.ai_credit_packs, public.ai_credit_ledger from anon, authenticated;

grant select on public.ai_credit_packs to authenticated;

grant select on public.ai_credit_ledger to authenticated;
