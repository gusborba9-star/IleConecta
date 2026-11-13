-- PASSO 181: 0102_reativacao_mesmo_dia — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0102 — Reativação no mesmo dia de um pagamento anterior.
-- Erro encontrado no teste do proprietário (13/11/2026): casa reativada por pagamento e cancelada de novo no mesmo dia não conseguia reativar,
-- porque a fatura de reativação repetia (casa, plano, período) e o índice "uma fatura por período" recusava. A fatura de reativação não é de um
-- ciclo mensal: passa a não ter período (period_start vazio), então não colide com a anterior. As faturas mensais seguem protegidas pelo índice.

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
v_id := public.platform_charge_issue(p_house, 'plan', 'plan:' || v_plan, v_amt, v_day, null, 'Reativação do plano', 'reativacao:' || p_house || ':' || to_char(v_day, 'YYYYMMDD') || ':' || (v_n + 1));
insert into public.platform_billing_events (provider, event_id, kind, charge_id, outcome, reason) values ('sistema', gen_random_uuid()::text, 'reativacao_solicitada', v_id, 'processado', p_house::text);
return v_id;
end $$;
