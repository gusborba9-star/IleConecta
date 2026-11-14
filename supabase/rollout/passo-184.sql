-- PASSO 184: 0103_cancelar_com_divida_e_aceite_cartoes — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
