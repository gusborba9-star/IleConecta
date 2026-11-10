-- PASSO 16 de 19: 0067 f: create_booking
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

CREATE OR REPLACE FUNCTION public.create_booking(p_service uuid, p_slot timestamp with time zone, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  svc public.services%rowtype;
  oid uuid;
  owner uuid;
  stamp text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para agendar.'; end if;
  select * into svc from public.services where id = p_service;
  if not found or not svc.active or not svc.bookable then raise exception 'Este serviço não tem agenda.'; end if;

  -- Libera horários de pedidos que não foram pagos a tempo.
  update public.service_orders set status = 'expirado'
   where house_id = svc.house_id and scheduled_at is not null and status = 'aguardando_pagamento' and expires_at <= now();
  update public.payments p set status = 'falhou'
   where p.status = 'pendente' and exists (select 1 from public.service_orders o where o.id = p.order_id and o.status = 'expirado');

  -- serializa com a publicação de rituais da mesma casa (ver events_schedule_guard)
  perform 1 from public.houses where id = svc.house_id for update;
  if not exists (select 1 from public.available_slots(p_service, (p_slot at time zone 'America/Sao_Paulo')::date, 1) s where s.slot = p_slot) then
    raise exception 'Esse horário não está mais disponível. Escolha outro.';
  end if;

  perform set_config('app.booking', '1', true);
  oid := public.create_service_order(p_service, p_note);
  perform set_config('app.booking', '', true);

  update public.service_orders
     set scheduled_at = p_slot,
         ends_at = p_slot + make_interval(mins => svc.duration_min),
         modality = case svc.delivery::text when 'presencial' then 'presencial' when 'transmissao' then 'distancia' else null end
   where id = oid;

  -- Sem pagamento ligado, a casa já foi avisada do pedido: acrescenta o horário ao aviso.
  select h.owner_id into owner from public.houses h where h.id = svc.house_id;
  stamp := to_char(p_slot at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  update public.notifications n set text = regexp_replace(n.text, '\.$', '') || '. Horário: ' || stamp || '.'
   where n.id = (select n2.id from public.notifications n2
                  where n2.user_id = owner and n2.text like 'Novo pedido: ' || svc.title || ' — de %'
                    and n2.created_at > now() - interval '1 minute'
                  order by n2.created_at desc limit 1);
  return oid;
exception when exclusion_violation then
  raise exception 'Esse horário acabou de ser reservado. Escolha outro.';
end $function$;

-- FIM DO PASSO 16
