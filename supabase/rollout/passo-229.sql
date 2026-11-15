-- PASSO 229: 0114_destaque_e_impulsionamento — parte 9 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) reembolso ============
create or replace function public.platform_promo_refund_begin(p_house uuid, p_charge uuid, p_by uuid default null, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.platform_charges; pr public.promotions; r public.promo_refunds; v_used int; v_unused int; v_amount bigint; v_id uuid;
begin
select * into c from public.platform_charges where id = p_charge for update;
if not found or c.house_id <> p_house or c.kind not in ('boost', 'highlight') or c.status <> 'paga' then raise exception 'Esta compra não pode ser reembolsada.'; end if;
select * into r from public.promo_refunds where charge_id = p_charge and status in ('pendente', 'concluido');
if found then
if r.status = 'concluido' then raise exception 'Esta compra já foi reembolsada.'; end if;
return jsonb_build_object('refund_id', r.id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', r.amount_cents, 'resume', true);
end if;
if p_now > c.paid_at + interval '7 days' then raise exception 'O prazo de 7 dias para reembolso já passou.'; end if;
select * into pr from public.promotions where charge_id = p_charge for update;
if not found or pr.status <> 'ativa' then raise exception 'Esta compra não está ativa.'; end if;
if c.paid_amount_cents is null or c.paid_ref is null or c.provider is null then raise exception 'Pagamento sem referência do provedor.'; end if;
v_used := public.promo_blocks_started(pr, p_now);
v_unused := pr.days - v_used;
if v_unused <= 0 then raise exception 'Todos os dias desta compra já começaram.'; end if;
v_amount := public.promo_refund_cents(c.paid_amount_cents, v_unused, pr.days);
if v_amount <= 0 then raise exception 'Nada a reembolsar.'; end if;
-- os dias que não começaram saem antes de pedir o estorno (não dá para usar enquanto devolve)
if v_used = 0 then
update public.promotions set status = 'reembolsada' where id = pr.id;
else
update public.promotions set days = v_used where id = pr.id;
end if;
insert into public.promo_refunds (charge_id, house_id, promotion_id, days_refunded, days_used, prev_days, amount_cents, provider, requested_by)
values (c.id, c.house_id, pr.id, v_unused, v_used, pr.days, v_amount, c.provider, p_by) returning id into v_id;
perform public.promo_rechain(pr.house_id, pr.kind, pr.scope, pr.item_id, p_now);
return jsonb_build_object('refund_id', v_id, 'provider', c.provider, 'ref', c.paid_ref, 'amount_cents', v_amount, 'days_refunded', v_unused, 'resume', false);
end $$;

create or replace function public.platform_promo_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.promo_refunds; c public.platform_charges; v_owner uuid; v_money text;
begin
select * into r from public.promo_refunds where id = p_refund for update;
if not found then raise exception 'Reembolso inexistente.'; end if;
if r.status = 'concluido' then return jsonb_build_object('already', true); end if;
if r.status <> 'pendente' then raise exception 'Reembolso encerrado sem estorno.'; end if;
select * into c from public.platform_charges where id = r.charge_id for update;
update public.promo_refunds set status = 'concluido', provider_ref = left(p_refund_ref, 200), done_at = p_now where id = r.id;
insert into public.platform_ledger_entries (charge_id, house_id, entry_type, amount_cents) values (r.charge_id, r.house_id, 'estorno', r.amount_cents);
if r.amount_cents >= c.paid_amount_cents and c.status = 'paga' then update public.platform_charges set status = 'estornada' where id = c.id; end if;
if r.reason = 'sem_vaga' then update public.promotions set status = 'reembolsada' where id = r.promotion_id and status = 'cancelada'; end if;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null and r.reason = 'pedido' then
v_money := 'R$ ' || replace(to_char(r.amount_cents / 100.0, 'FM9999990.00'), '.', ',');
insert into public.notifications (user_id, text, href) values (v_owner, 'Reembolso de ' || v_money || ' aprovado: devolvemos ' || r.days_refunded || ' dia(s) que não começaram. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.', '/planos');
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

create or replace function public.platform_promo_refund_fail(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.promo_refunds; pr public.promotions; v_owner uuid;
begin
select * into r from public.promo_refunds where id = p_refund for update;
if not found or r.status <> 'pendente' then return; end if;
-- falha definitiva do provedor: nos reembolsos automáticos por falta de vaga a rotina tenta de novo
if r.reason = 'sem_vaga' then return; end if;
update public.promo_refunds set status = 'falhou', error = left(coalesce(p_error, 'recusado'), 300) where id = r.id;
select * into pr from public.promotions where id = r.promotion_id for update;
update public.promotions set status = 'ativa', days = r.prev_days where id = pr.id;
perform public.promo_rechain(pr.house_id, pr.kind, pr.scope, pr.item_id, now());
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso agora. Os seus dias foram mantidos. Tente de novo em instantes ou fale com o suporte.', '/planos');
end if;
end $$;
