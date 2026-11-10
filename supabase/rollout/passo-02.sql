-- PASSO 2 de 19: 0064 b: confirm_payment_row
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ 2) confirmação por ID da linha travada ============
-- Corpo VIVO de confirm_payment, idêntico em efeitos financeiros, mas a linha vem por id (não por provider_ref).
CREATE OR REPLACE FUNCTION public.confirm_payment_row(p_payment uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 pay public.payments%rowtype;
 res public.reservations%rowtype;
 ev public.events%rowtype;
 ord public.service_orders%rowtype;
 fee bigint;
 owner uuid;
 cname text;
 direct boolean;
 suffix text;
 begin
 if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
 select * into pay from public.payments where id = p_payment for update;
 if not found then return 'desconhecido'; end if;
 if pay.status = 'confirmado' then return 'ja_confirmado'; end if;
 if pay.status not in ('pendente', 'falhou') then return 'ignorado'; end if;
 if pay.member_due_id is not null then return public.confirm_member_due_payment(pay.id); end if; direct := pay.provider = 'stripe';
 if pay.order_id is not null then
 select * into ord from public.service_orders where id = pay.order_id for update;
 update public.payments set status = 'confirmado', confirmed_at = now() where id = pay.id;
 suffix := case when ord.stages_total > 1 then ' (etapa ' || pay.stage_no || ' de ' || ord.stages_total || ')' else '' end;
 if pay.stage_no > 1 then
 if ord.status not in ('confirmado', 'em_andamento', 'concluido') then
 perform public.open_refund_for_payment(pay.id, ord.house_id, ord.client_id);
 return 'reembolso_pendente';
 end if;
 fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, 'servico'));
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, ord.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Serviço contratado pela plataforma' || suffix),
 (pay.id, ord.house_id, 'plataforma', fee, pay.fee_rule_version, 'Comissão da plataforma (4%)'),
 (pay.id, ord.house_id, 'casa', pay.gross_cents - fee, pay.fee_rule_version,
 'Recebido direto pela casa (a tarifa do Stripe é cobrada dela)');
 select h.owner_id into owner from public.houses h where h.id = ord.house_id;
 insert into public.notifications (user_id, text, href)
 values (owner, 'Etapa paga: ' || ord.title || suffix || '.', '/casa/' || owner || '?aba=servicos');
 return 'confirmado';
 end if;
 if (ord.status = 'expirado' and ord.scheduled_at is not null and exists (select 1 from public.service_orders o3 where o3.house_id = ord.house_id and o3.id <> ord.id and o3.scheduled_at is not null and o3.status in ('aguardando_pagamento', 'confirmado', 'em_andamento') and tstzrange(o3.scheduled_at, o3.ends_at) && tstzrange(ord.scheduled_at, ord.ends_at))) or ord.status <> 'aguardando_pagamento'
 and not (ord.status = 'expirado' and not exists (
 select 1 from public.service_orders o2
 where o2.client_id = ord.client_id and o2.service_id = ord.service_id and o2.id <> ord.id
 and o2.status in ('aguardando_pagamento', 'confirmado', 'em_andamento'))) then
 update public.service_orders set status = 'reembolso_pendente', updated_at = now()
 where id = ord.id and status in ('expirado', 'cancelado');
 return 'reembolso_pendente';
 end if;
 update public.service_orders set status = 'confirmado', expires_at = null, updated_at = now() where id = ord.id;
 fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, 'servico'));
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, ord.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Serviço contratado pela plataforma' || suffix),
 (pay.id, ord.house_id, 'plataforma', fee, pay.fee_rule_version, 'Comissão da plataforma (4%)'),
 (pay.id, ord.house_id, 'casa', pay.gross_cents - fee,
 pay.fee_rule_version, case when direct then 'Recebido direto pela casa (a tarifa do Stripe é cobrada dela)' else 'Líquido da casa (retido até 72h após a conclusão)' end);
 if not direct then
 insert into public.payouts (house_id, order_id, amount_cents, eligible_at, status)
 values (ord.house_id, ord.id, pay.gross_cents - fee, 'infinity', 'bloqueado');
 end if;
 select h.owner_id into owner from public.houses h where h.id = ord.house_id;
 select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = ord.client_id;
 insert into public.notifications (user_id, text, href)
 values (owner, 'Novo pedido pago: ' || ord.title || suffix || coalesce(' (' || case ord.modality when 'presencial' then 'presencial' when 'distancia' then 'à distância' end || ')', '') || ' — de ' || cname || '.' || coalesce(' Horário: ' || to_char(ord.scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.', ''), '/casa/' || owner || '?aba=servicos');
 return 'confirmado';
 end if;
 select * into res from public.reservations where id = pay.reservation_id for update;
 select * into ev from public.events where id = res.event_id for update;
 update public.payments set status = 'confirmado', confirmed_at = now() where id = pay.id;
 if ev.status = 'cancelado'
 or (res.status <> 'aguardando_pagamento' and res.status <> 'expirada')
 or (res.status = 'expirada' and (
 public.event_taken(ev.id) >= ev.seats_total
 or exists (select 1 from public.reservations o
 where o.event_id = ev.id and o.user_id = res.user_id and o.id <> res.id
 and o.status in ('aguardando_pagamento', 'confirmada')))) then
 update public.reservations set status = 'reembolso_pendente' where id = res.id and status <> 'confirmada';
 return 'reembolso_pendente';
 end if;
 update public.reservations set status = 'confirmada' where id = res.id;
 fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, 'ritual'));
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, ev.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Vaga em ritual'),
 (pay.id, ev.house_id, 'plataforma', fee, pay.fee_rule_version, 'Comissão da plataforma (15%)'),
 (pay.id, ev.house_id, 'casa', pay.gross_cents - fee,
 pay.fee_rule_version, case when direct then 'Recebido direto pela casa (a tarifa do Stripe é cobrada dela)' else 'Líquido da casa (retido até 72h após o ritual)' end);
 if not direct then
 insert into public.payouts (house_id, event_id, amount_cents, eligible_at, status)
 values (ev.house_id, ev.id, pay.gross_cents - fee,
 coalesce(ev.ends_at, ev.starts_at) + interval '72 hours', 'bloqueado')
 on conflict (event_id) do update
 set amount_cents = public.payouts.amount_cents + excluded.amount_cents
 where public.payouts.status = 'bloqueado';
 end if;
 return 'confirmado';
 end $function$;

-- FIM DO PASSO 2
