-- PASSO 198: 0107_reembolso_conta_reutilizada_cdc — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0107 — Reembolso de 7 dias e conta reutilizada: ajuste pelo parecer do advogado (14/11/2026).
-- Negar o arrependimento de 7 dias (CDC, art. 49) a quem nunca usou esse direito seria ilegal; o benefício só é negado quando uma conta anterior
-- do mesmo e-mail (excluída) JÁ usou o reembolso de 7 dias (abuso de direito). Conta reutilizada sem reembolso usado antes mantém o direito.
-- A marca "conta reutilizada" e o painel do administrador continuam como em 0106. Textos-modelo de aviso passam para a redação neutra do advogado.

-- ============ 1) a casa já usou o reembolso de 7 dias numa conta anterior do mesmo e-mail? ============
create or replace function public.house_owner_refund_used_before(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (
  select 1 from public.houses h, lateral public.account_prior_deleted(h.owner_id) pd(uid)
  join public.houses ph on ph.owner_id = pd.uid
  join public.platform_plan_refunds r on r.house_id = ph.id and r.status in ('pendente', 'concluido')
  where h.id = p_house);
$$;

-- ============ 2) reembolso de 7 dias e tela da casa ============
create or replace function public.platform_plan_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; r public.platform_plan_refunds; v_first uuid; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'plan' or c.status <> 'paga' then raise exception 'Esta cobrança não pode ser reembolsada.'; end if;
if public.house_owner_refund_used_before(p_house) then raise exception 'Conta reutilizada: o reembolso de 7 dias já foi utilizado em uma conta anterior vinculada a este e-mail e não é concedido novamente.'; end if;
select * into r from public.platform_plan_refunds where house_id = p_house and status in ('pendente', 'concluido');
if found then
if r.charge_id <> p_charge then raise exception 'O reembolso de 7 dias do plano já foi usado por esta casa.'; end if;
if r.status = 'concluido' then raise exception 'Esta cobrança já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
select id into v_first from public.platform_charges where house_id = p_house and kind = 'plan' and status in ('paga', 'estornada') order by paid_at asc nulls last, created_at asc limit 1;
if v_first is distinct from p_charge then raise exception 'O reembolso de 7 dias vale só para o primeiro pagamento do plano.'; end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
insert into public.platform_plan_refunds (charge_id, house_id, amount_cents, provider, requested_by) values (c.id, c.house_id, c.paid_amount_cents, c.provider, p_by) returning id into v_id;
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', c.paid_amount_cents, 'resume', false);
end $$;

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
and not exists (select 1 from public.platform_plan_refunds r where r.house_id = h and r.status in ('pendente', 'concluido'))
and not public.house_owner_refund_used_before(h),
'returning', public.house_owner_is_returning(h),
'refund_blocked', public.house_owner_refund_used_before(h),
'charge_id', case when v_first.status = 'paga' then v_first.id end, 'amount_cents', v_first.paid_amount_cents, 'deadline', v_first.paid_at + interval '7 days',
'history', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'status', r.status, 'at', r.created_at) order by r.created_at desc)
from (select * from public.platform_plan_refunds where house_id = h and status in ('pendente', 'concluido') order by created_at desc limit 5) r), '[]'::jsonb));
end $$;
