-- PASSO 156: 0098_reembolso_plano_7_dias — parte 10 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) tela da casa e reativação pelo suporte ============
create or replace function public.my_plan_refund() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; v_first public.platform_charges;
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'eligible', false, 'window_days', 7, 'history', '[]'::jsonb); end if;
select * into v_first from public.platform_charges where house_id = h and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
return jsonb_build_object('has_house', true, 'window_days', 7,
'cancelled', coalesce((select s.cancelled_at is not null from public.house_billing_state s where s.house_id = h), false),
'eligible', v_first.id is not null and v_first.status = 'paga' and v_first.paid_at + interval '7 days' >= now() and v_first.paid_amount_cents is not null and v_first.paid_ref is not null
and not exists (select 1 from public.platform_plan_refunds r where r.house_id = h and r.status in ('pendente', 'concluido')),
'charge_id', case when v_first.status = 'paga' then v_first.id end, 'amount_cents', v_first.paid_amount_cents, 'deadline', v_first.paid_at + interval '7 days',
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_plan_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 5) r), '[]'::jsonb));
end $$;
