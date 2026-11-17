-- 0147 — "Cancelar agora" em Pedidos e validações também exclui a publicação impulsionada (decisão do proprietário, 17/11/2026, com o aval do advogado).
-- A casa, em Pedidos e validações, escolhe [Continuar até o final] ou [Cancelar agora]. Cancelar agora, num impulsionamento de PUBLICAÇÃO, pede o reembolso dos
-- dias que ainda não começaram e, quando o estorno for CONFIRMADO (pode levar minutos), exclui a publicação. Os dias já iniciados são pagos, não voltam e
-- param junto com a publicação. Se o estorno falhar, nada é excluído. Com mais de uma compra no mesmo post, a exclusão acontece quando a última for reembolsada.

alter table public.promotions add column if not exists delete_post_after_refund boolean not null default false;

-- a casa marca (ou desmarca) que, concluído o reembolso desta compra, a publicação deve ser excluída; a tabela não tem política de alteração
create or replace function public.house_set_post_delete_after_refund(p_charge uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.promotions; v_owner uuid;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.'; end if;
  if p_on is null then raise exception 'Informe se a publicação deve ser excluída.'; end if;
  select * into pr from public.promotions where charge_id = p_charge;
  select h.owner_id into v_owner from public.houses h where h.id = pr.house_id;
  if pr.id is null or v_owner is distinct from (select auth.uid()) then raise exception 'Você só pode cuidar das compras da sua casa.'; end if;
  if pr.item_type is distinct from 'post' then raise exception 'Esta compra não é de uma publicação.'; end if;
  if p_on and pr.status <> 'ativa' then raise exception 'Esta compra não está ativa.'; end if;
  update public.promotions set delete_post_after_refund = p_on where id = pr.id;
end $$;

revoke all on function public.house_set_post_delete_after_refund(uuid, boolean) from public, anon;

grant execute on function public.house_set_post_delete_after_refund(uuid, boolean) to authenticated;

-- reembolso concluído: agora também exclui a publicação quando foi pedido (substitui a da 0114: mesmas regras + esta)
create or replace function public.platform_promo_refund_done(p_refund uuid, p_refund_ref text, p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.promo_refunds; c public.platform_charges; pr public.promotions; v_owner uuid; v_money text;
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
-- pedido "cancelar agora" de uma publicação: com todos os reembolsos da publicação concluídos, ela sai junto (os dias já iniciados, pagos, não voltam e param)
select * into pr from public.promotions where id = r.promotion_id;
if pr.item_type = 'post' and exists (select 1 from public.promotions x where x.item_type = 'post' and x.item_id = pr.item_id and x.delete_post_after_refund)
   and public.post_delete_state(pr.item_id) in ('livre', 'liberado') then
update public.promotions set status = 'encerrada' where item_type = 'post' and item_id = pr.item_id and status in ('aguardando', 'ativa');
delete from public.posts where id = pr.item_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Sua publicação foi excluída, como você pediu. Os dias de impulsionamento que já tinham começado não são devolvidos.', '/planos');
end if;
end if;
return jsonb_build_object('already', false, 'amount_cents', r.amount_cents);
end $$;

-- estorno que falha: a compra volta ao que era e o pedido de excluir é desfeito (substitui a da 0114)
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
update public.promotions set status = 'ativa', days = r.prev_days, delete_post_after_refund = false where id = pr.id;
perform public.promo_rechain(pr.house_id, pr.kind, pr.scope, pr.item_id, now());
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner, 'Não foi possível concluir o reembolso agora. Os seus dias foram mantidos. Tente de novo em instantes ou fale com o suporte.', '/planos');
end if;
end $$;
