-- PASSO 247: 0118_proposta_de_horario_pelo_chat — parte 5 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 9) Cliente toca em "Confirmar e pagar": reserva o horário e devolve o pedido para o pagamento normal
create or replace function public.accept_proposal(p_id uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.schedule_proposals%rowtype;
  svc public.services%rowtype;
  ord public.service_orders%rowtype;
  me uuid := auth.uid();
  owner uuid;
  oid uuid;
  reason text;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  select * into p from public.schedule_proposals where id = p_id for update;
  if not found or p.client_id <> me then raise exception 'Proposta não encontrada.'; end if;
  select * into svc from public.services where id = p.service_id;
  select h.owner_id into owner from public.houses h where h.id = p.house_id;

  if p.status = 'aberta' and p.expires_at <= now() then
    update public.schedule_proposals set status = 'expirada' where id = p.id;
    return jsonb_build_object('ok', false, 'reason', 'expirada', 'message', 'Esta proposta expirou. Peça um novo horário à casa.');
  end if;
  if p.status <> 'aberta' then
    return jsonb_build_object('ok', false, 'reason', p.status, 'message',
      case p.status when 'cancelada' then 'A casa cancelou esta proposta. Peça um novo horário.'
                    when 'indisponivel' then 'Esse horário não está mais disponível. A casa foi avisada para propor outro.'
                    else 'Esta proposta expirou. Peça um novo horário à casa.' end);
  end if;
  if svc.id is null or not svc.active then
    update public.schedule_proposals set status = 'cancelada' where id = p.id;
    return jsonb_build_object('ok', false, 'reason', 'cancelada', 'message', 'Este serviço não está mais disponível.');
  end if;
  if svc.price_cents <> p.price_cents then
    update public.schedule_proposals set status = 'cancelada' where id = p.id;
    insert into public.notifications (user_id, text, href)
    values (owner, 'O valor de "' || svc.title || '" mudou depois da proposta. Envie uma nova proposta ao cliente.', '/mensagens/' || p.client_id);
    return jsonb_build_object('ok', false, 'reason', 'preco', 'message', 'O valor do serviço mudou depois da proposta. Peça à casa uma nova proposta.');
  end if;

  -- já existe pedido desta proposta?
  if p.order_id is not null then
    select * into ord from public.service_orders where id = p.order_id;
    if ord.status = 'aguardando_pagamento' and ord.expires_at > now() then
      return jsonb_build_object('ok', true, 'order_id', ord.id, 'resumed', true);
    end if;
    if ord.status in ('confirmado', 'em_andamento', 'concluido') then
      return jsonb_build_object('ok', false, 'reason', 'paga', 'message', 'Este horário já está pago e confirmado.');
    end if;
  end if;

  -- libera horários de pedidos que não foram pagos a tempo
  update public.service_orders set status = 'expirado'
   where house_id = p.house_id and scheduled_at is not null and status = 'aguardando_pagamento' and expires_at <= now();
  update public.payments pay set status = 'falhou'
   where pay.status = 'pendente' and exists (select 1 from public.service_orders o where o.id = pay.order_id and o.status = 'expirado');

  perform 1 from public.houses where id = p.house_id for update;
  reason := public.schedule_conflict(p.house_id, p.starts_at, p.ends_at, null);
  if reason is null and p.starts_at < now() + interval '5 minutes' then reason := 'passado'; end if;
  if reason is null then
    begin
      perform set_config('app.booking', '1', true);
      oid := public.create_service_order(p.service_id, p_note);
      perform set_config('app.booking', '', true);
      update public.service_orders
         set scheduled_at = p.starts_at, ends_at = p.ends_at,
             modality = case svc.delivery::text when 'presencial' then 'presencial' when 'transmissao' then 'distancia' else null end
       where id = oid;
    exception when exclusion_violation then
      perform set_config('app.booking', '', true);
      reason := 'pedido';
    end;
  end if;

  if reason is not null then
    update public.schedule_proposals set status = 'indisponivel' where id = p.id;
    insert into public.notifications (user_id, text, href)
    values (owner, 'O horário proposto (' || public.proposal_when_text(p.starts_at) || ', ' || svc.title || ') não está mais disponível. Envie outro horário ao cliente.', '/mensagens/' || p.client_id);
    return jsonb_build_object('ok', false, 'reason', 'indisponivel', 'message', 'Esse horário não está mais disponível. A casa foi avisada para propor outro.');
  end if;

  update public.schedule_proposals set order_id = oid where id = p.id;
  return jsonb_build_object('ok', true, 'order_id', oid);
end $$;

revoke all on function public.accept_proposal(uuid, text) from public, anon;

grant execute on function public.accept_proposal(uuid, text) to authenticated;
