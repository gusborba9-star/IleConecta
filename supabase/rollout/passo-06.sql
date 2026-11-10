-- PASSO 6 de 18: 0064 f: complete_refund
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

CREATE OR REPLACE FUNCTION public.complete_refund(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 declare
 rr public.refund_requests%rowtype;
 pay public.payments%rowtype;
 po public.payouts%rowtype;
 fee bigint;
 net bigint;
 v_gross bigint;
 v_ver text;
 owner uuid;
 result text := 'estornado';
 begin
 if coalesce(auth.role(), '') <> 'service_role' and not coalesce(public.is_admin(), false) then
 raise exception 'Não autorizado.' using errcode = '42501';
 end if;
 select * into rr from public.refund_requests where id = p_id for update;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 if rr.status = 'reembolsado' then return 'ja_reembolsado'; end if;
 if rr.status <> 'aprovado' then raise exception 'Só um reembolso aprovado pode ser concluído.'; end if;
 select * into pay from public.payments where id = rr.payment_id for update;
 if pay.status <> 'confirmado' then raise exception 'O pagamento não está confirmado.'; end if;
 select r.gross, r.fee, r.net, r.version into v_gross, fee, net, v_ver from public.payment_recorded_amounts(pay.id) r;
 update public.payments set status = 'estornado' where id = pay.id;
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, rr.house_id, 'bruto', -v_gross, v_ver, 'Estorno (reembolso aprovado)'),
 (pay.id, rr.house_id, 'plataforma', -fee, v_ver, 'Estorno da comissão da plataforma'),
 (pay.id, rr.house_id, 'casa', -net, v_ver, 'Estorno do valor da casa');
 select * into po from public.payouts
 where (pay.reservation_id is not null and event_id = (select r.event_id from public.reservations r where r.id = pay.reservation_id))
 or (pay.order_id is not null and order_id = pay.order_id)
 for update;
 if found then
 if po.status in ('bloqueado', 'elegivel', 'falhou') then
 if po.amount_cents - net <= 0 then
 delete from public.payouts where id = po.id;
 else
 update public.payouts set amount_cents = amount_cents - net where id = po.id;
 end if;
 else
 insert into public.house_debits (house_id, refund_id, amount_cents, note)
 values (rr.house_id, rr.id, net, 'Reembolso após o repasse já ter sido pago.');
 result := 'estornado_com_debito';
 end if;
 end if;
 if pay.reservation_id is not null then
 update public.reservations set status = 'reembolsada' where id = pay.reservation_id and status in ('confirmada', 'reembolso_pendente');
 else
 update public.service_orders set status = 'reembolsado', updated_at = now()
 where id = pay.order_id and status in ('em_andamento', 'concluido', 'reembolso_pendente');
 end if;
 update public.refund_requests set status = 'reembolsado', completed_at = now(), updated_at = now() where id = rr.id;
 perform public.refund_log_add(rr.id, auth.uid(), 'concluido', result);
 select h.owner_id into owner from public.houses h where h.id = rr.house_id;
 insert into public.notifications (user_id, text, href) values
 (rr.client_id, 'Reembolso concluído. O valor volta para a forma de pagamento usada.', '/atividade'),
 (owner, case when pay.provider = 'stripe'
 then 'Um reembolso foi concluído. O valor foi devolvido ao cliente a partir da sua conta Stripe.'
 when result = 'estornado_com_debito'
 then 'Um reembolso foi concluído depois do seu repasse. O valor será descontado dos próximos repasses.'
 else 'Um reembolso foi concluído e retirado do seu repasse.' end, '/casa/' || owner);
 return result;
 end $function$;

-- FIM DO PASSO 6
