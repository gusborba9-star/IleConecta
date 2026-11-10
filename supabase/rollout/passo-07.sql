-- PASSO 7 de 18: 0064 g: complete_cancel_refund
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

CREATE OR REPLACE FUNCTION public.complete_cancel_refund(p_payment uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 pay public.payments%rowtype;
 fee bigint;
 net bigint;
 v_gross bigint;
 v_ver text;
 hid uuid;
 cid uuid;
 ttl text;
 owner uuid;
begin
 if coalesce(auth.role(), '') <> 'service_role' then
 raise exception 'Não autorizado.' using errcode = '42501';
 end if;
 select * into pay from public.payments where id = p_payment for update;
 if not found then raise exception 'Pagamento não encontrado.'; end if;
 if pay.status = 'estornado' then return 'ja_estornado'; end if;
 if pay.status <> 'confirmado' then raise exception 'O pagamento não está confirmado.'; end if;
 if exists (select 1 from public.refund_requests r where r.payment_id = pay.id and r.status in ('pendente', 'aprovado')) then
 raise exception 'Há um pedido de reembolso em andamento para este pagamento.';
 end if;
 if pay.reservation_id is not null then
 select e.house_id, r.user_id, e.title into hid, cid, ttl
 from public.reservations r join public.events e on e.id = r.event_id where r.id = pay.reservation_id;
 else
 select o.house_id, o.client_id, o.title into hid, cid, ttl
 from public.service_orders o where o.id = pay.order_id;
 end if;
 select r.gross, r.fee, r.net, r.version into v_gross, fee, net, v_ver from public.payment_recorded_amounts(pay.id) r;
 update public.payments set status = 'estornado' where id = pay.id;
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, hid, 'bruto', -v_gross, v_ver, 'Estorno (cancelamento antes do início)'),
 (pay.id, hid, 'plataforma', -fee, v_ver, 'Estorno da comissão da plataforma'),
 (pay.id, hid, 'casa', -net, v_ver, 'Estorno do valor da casa');
 if pay.reservation_id is not null then
 update public.reservations set status = 'reembolsada' where id = pay.reservation_id and status = 'reembolso_pendente';
 else
 update public.service_orders set status = 'reembolsado', updated_at = now()
 where id = pay.order_id and status = 'reembolso_pendente'
 and not exists (select 1 from public.payments p2 where p2.order_id = pay.order_id and p2.status = 'confirmado');
 end if;
 select h.owner_id into owner from public.houses h where h.id = hid;
 insert into public.notifications (user_id, text, href) values
 (cid, 'Reembolso concluído: ' || coalesce(ttl, 'sua compra') || '. O valor volta para a forma de pagamento usada.', '/atividade'),
 (owner, 'Um cancelamento foi reembolsado ao cliente: ' || coalesce(ttl, 'compra') || '.', '/casa/' || owner);
 return 'estornado';
end $function$;

-- FIM DO PASSO 7
