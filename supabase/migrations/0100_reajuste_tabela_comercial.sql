-- 0100 — Atualização da tabela comercial (reajuste de mensalidade) com aviso de 30 dias.
-- Decisão do proprietário e do jurídico (2026-11-13): sem índice; "atualização da tabela comercial"; aviso à casa com no mínimo 30 dias de antecedência da renovação.
-- Como funciona: o administrador ANUNCIA o novo valor de um plano com data de vigência (mínimo 30 dias à frente). As casas matriculadas naquele plano recebem
-- notificação (com registro de leitura e push). A fatura de uma renovação com vencimento NA data de vigência ou depois dela sai com o valor novo; antes disso, o valor antigo.
-- Na data, a tabela de preços do painel passa a ter o valor novo (para novas contratações e reativações). Redução de preço vale na hora (é favorável à casa).
-- Aumento direto na tabela (sem anunciar) é recusado enquanto a cobrança da plataforma estiver ligada.
-- Estado de produção antes desta migration: nenhum reajuste anunciado.

-- ============ 1) reajustes anunciados ============
create table if not exists public.platform_price_changes (
id uuid primary key default gen_random_uuid(),
plan text not null check (plan in ('base', 'intermediario', 'maximo')),
old_cents bigint not null check (old_cents between 100 and 5000000),
new_cents bigint not null check (new_cents between 100 and 5000000 and new_cents > old_cents),
announced_on date not null,
effective_on date not null,
status text not null default 'anunciado' check (status in ('anunciado', 'aplicado', 'cancelado')),
reason text check (reason is null or char_length(reason) <= 300),
announced_by uuid,
notified integer not null default 0,
created_at timestamptz not null default now(),
applied_at timestamptz,
check (effective_on >= announced_on + 30)
);

create unique index if not exists platform_price_changes_one_open on public.platform_price_changes (plan) where status = 'anunciado';

alter table public.platform_price_changes enable row level security;

drop policy if exists ppc_read on public.platform_price_changes;

create policy ppc_read on public.platform_price_changes for select to authenticated using (public.is_admin());

create or replace function public.platform_price_changes_guard() returns trigger
language plpgsql set search_path = public as $$
begin
if tg_op = 'DELETE' then raise exception 'Reajuste não pode ser apagado.'; end if;
if old.status <> 'anunciado' then raise exception 'Reajuste encerrado não pode ser alterado.'; end if;
if new.id is distinct from old.id or new.plan is distinct from old.plan or new.old_cents is distinct from old.old_cents or new.new_cents is distinct from old.new_cents
or new.announced_on is distinct from old.announced_on or new.effective_on is distinct from old.effective_on or new.created_at is distinct from old.created_at then
raise exception 'Valor, plano e datas do reajuste anunciado não podem ser alterados.';
end if;
return new;
end $$;

drop trigger if exists trg_platform_price_changes_guard on public.platform_price_changes;

create trigger trg_platform_price_changes_guard before update or delete on public.platform_price_changes
for each row execute function public.platform_price_changes_guard();

-- ============ 2) valor da mensalidade de um plano numa data de renovação ============
create or replace function public.platform_plan_monthly_cents(p_plan text, p_on date) returns bigint
language sql stable security definer set search_path = public as $$
select coalesce(
(select c.new_cents from public.platform_price_changes c where c.plan = p_plan and c.status = 'anunciado' and c.effective_on <= p_on order by c.effective_on desc limit 1),
(select case when (value -> 'plans' -> p_plan ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then round((value -> 'plans' -> p_plan ->> 'monthly')::numeric * 100)::bigint end from public.platform_settings where key = 'pricing'));
$$;

-- ============ 3) a rotina diária usa o valor da data da renovação ============
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

-- ============ 4) administrador anuncia, avisa as casas e pode cancelar antes da vigência ============
create or replace function public.admin_price_announce(p_plan text, p_new_monthly numeric, p_effective_on date, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_old bigint; v_new bigint; v_id uuid; v_n integer; v_name text; v_text text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Plano inválido.'; end if;
if p_effective_on is null or p_effective_on < v_today + 30 then raise exception 'A data de vigência precisa ter pelo menos 30 dias de antecedência.'; end if;
if p_effective_on > v_today + 400 then raise exception 'A data de vigência está muito distante.'; end if;
if p_new_monthly is null or p_new_monthly <= 0 or p_new_monthly > 50000 then raise exception 'Valor inválido.'; end if;
v_new := round(p_new_monthly * 100)::bigint;
v_old := public.platform_plan_monthly_cents(p_plan, v_today);
if v_old is null then raise exception 'Este plano não tem mensalidade na tabela.'; end if;
if v_new <= v_old then raise exception 'Redução de preço vale na hora e é feita direto na tabela de preços; o reajuste anunciado é só para aumento.'; end if;
select value -> 'plans' -> p_plan ->> 'name' into v_name from public.platform_settings where key = 'pricing';
insert into public.platform_price_changes (plan, old_cents, new_cents, announced_on, effective_on, reason, announced_by)
values (p_plan, v_old, v_new, v_today, p_effective_on, left(btrim(p_reason), 300), auth.uid()) returning id into v_id;
v_text := 'Atualização da tabela comercial: a partir de ' || to_char(p_effective_on, 'DD/MM/YYYY') || ', o plano ' || coalesce(v_name, p_plan) || ' passa de R$ ' || replace(to_char(v_old / 100.0, 'FM9999990.00'), '.', ',') || ' para R$ ' || replace(to_char(v_new / 100.0, 'FM9999990.00'), '.', ',') || ' por mês. O novo valor vale para as renovações com vencimento a partir dessa data. Em caso de dúvida, fale com o suporte.';
insert into public.notifications (user_id, text, href)
select distinct h.owner_id, v_text, '/planos' from public.houses h join public.house_billing_plan b on b.house_id = h.id and b.active
where h.plan::text = p_plan and h.owner_id is not null;
get diagnostics v_n = row_count;
update public.platform_price_changes set notified = v_n where id = v_id;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'price_announce', null, jsonb_build_object('change', v_id, 'plan', p_plan, 'old_cents', v_old, 'new_cents', v_new, 'effective_on', p_effective_on, 'notified', v_n));
return jsonb_build_object('id', v_id, 'notified', v_n, 'old_cents', v_old, 'new_cents', v_new);
end $$;

create or replace function public.admin_price_cancel(p_change uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.platform_price_changes; v_n integer; v_name text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Informe o motivo (mínimo de 10 caracteres).'; end if;
select * into c from public.platform_price_changes where id = p_change for update;
if not found or c.status <> 'anunciado' then raise exception 'Este reajuste não está mais anunciado.'; end if;
update public.platform_price_changes set status = 'cancelado' where id = c.id;
select value -> 'plans' -> c.plan ->> 'name' into v_name from public.platform_settings where key = 'pricing';
insert into public.notifications (user_id, text, href)
select distinct h.owner_id, 'Atualização da tabela comercial cancelada: o plano ' || coalesce(v_name, c.plan) || ' continua em R$ ' || replace(to_char(c.old_cents / 100.0, 'FM9999990.00'), '.', ',') || ' por mês. O aviso anterior de reajuste não vale mais.', '/planos'
from public.houses h join public.house_billing_plan b on b.house_id = h.id and b.active where h.plan::text = c.plan and h.owner_id is not null;
get diagnostics v_n = row_count;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'price_cancel', null, jsonb_build_object('change', c.id, 'reason', left(btrim(p_reason), 300)));
return v_n;
end $$;

-- ============ 5) na data de vigência a tabela de preços recebe o valor novo ============
create or replace function public.platform_price_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; c record; n integer := 0;
begin
for c in select * from public.platform_price_changes where status = 'anunciado' and effective_on <= d order by effective_on for update loop
perform set_config('app.price_apply', 'on', true);
update public.platform_settings set value = jsonb_set(value, array['plans', c.plan, 'monthly'], to_jsonb(round(c.new_cents / 100.0, 2))), updated_at = now() where key = 'pricing';
perform set_config('app.price_apply', 'off', true);
update public.platform_price_changes set status = 'aplicado', applied_at = p_now where id = c.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'preco_aplicado', 'processado', c.plan || ':' || c.new_cents);
n := n + 1;
end loop;
return n;
end $$;

-- ============ 6) aumento direto na tabela é recusado com a cobrança ligada (redução e demais campos seguem livres) ============
create or replace function public.platform_pricing_increase_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text; o numeric; n numeric;
begin
if new.key <> 'pricing' or coalesce(current_setting('app.price_apply', true), '') = 'on' then return new; end if;
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return new; end if;
for p in select jsonb_object_keys(coalesce(new.value -> 'plans', '{}'::jsonb)) loop
o := case when (old.value -> 'plans' -> p ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then (old.value -> 'plans' -> p ->> 'monthly')::numeric end;
n := case when (new.value -> 'plans' -> p ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then (new.value -> 'plans' -> p ->> 'monthly')::numeric end;
if o is not null and n is not null and n > o then raise exception 'Aumento de mensalidade só por reajuste anunciado, com 30 dias de antecedência.'; end if;
end loop;
return new;
end $$;

drop trigger if exists trg_platform_pricing_increase_guard on public.platform_settings;

create trigger trg_platform_pricing_increase_guard before update on public.platform_settings
for each row execute function public.platform_pricing_increase_guard();

-- aplica reajustes vencidos todo dia (de hora em hora, conferido pela data de Brasília)
select cron.unschedule('platform-price-apply') where exists (select 1 from cron.job where jobname = 'platform-price-apply');

select cron.schedule('platform-price-apply', '10 * * * *', $job$ select public.platform_price_apply_due() $job$);

-- ============ 7) permissões ============
revoke all on public.platform_price_changes from anon, authenticated;

grant select on public.platform_price_changes to authenticated;

revoke all on function public.platform_price_changes_guard(), public.platform_plan_monthly_cents(text, date), public.admin_price_announce(text, numeric, date, text), public.admin_price_cancel(uuid, text),
public.platform_price_apply_due(timestamptz), public.platform_pricing_increase_guard() from public, anon, authenticated;

grant execute on function public.platform_plan_monthly_cents(text, date), public.platform_price_apply_due(timestamptz) to service_role;

grant execute on function public.admin_price_announce(text, numeric, date, text), public.admin_price_cancel(uuid, text) to authenticated, service_role;
