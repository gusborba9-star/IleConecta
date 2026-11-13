-- PASSO 153: 0098_reembolso_plano_7_dias — parte 7 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) começar o reembolso: valida e registra (repetir não duplica) ============
create or replace function public.platform_plan_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; r public.platform_plan_refunds; v_first uuid; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind <> 'plan' or c.status <> 'paga' then raise exception 'Esta cobrança não pode ser reembolsada.'; end if;
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
