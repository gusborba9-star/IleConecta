-- PASSO 12 de 18: 0067 b: reserve_event
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ F3) janela de 1 hora ============
CREATE OR REPLACE FUNCTION public.reserve_event(p_event uuid, p_answers jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.events%rowtype;
  fld jsonb;
  v text;
  rid uuid;
  paid boolean;
  owner uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para reservar.'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found or ev.status <> 'publicado' then raise exception 'Este ritual não está disponível.'; end if;
  if ev.started_at is not null or ev.starts_at <= now() + interval '1 hour' then raise exception 'As reservas deste ritual encerram 1 hora antes do início.'; end if;
  if public.is_house_owner(ev.house_id) then raise exception 'A casa não reserva vaga no próprio ritual.'; end if;

  update public.reservations set status = 'expirada'
    where event_id = p_event and status = 'aguardando_pagamento' and expires_at <= now();
  update public.payments p set status = 'falhou'
    where p.status = 'pendente' and exists (
      select 1 from public.reservations r where r.id = p.reservation_id and r.event_id = p_event and r.status = 'expirada');

  if public.event_taken(p_event) >= ev.seats_total then raise exception 'Vagas esgotadas.'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Respostas inválidas.'; end if;
  for fld in select * from jsonb_array_elements(ev.intake_fields) loop
    v := btrim(coalesce(p_answers ->> (fld ->> 'id'), ''));
    if coalesce((fld ->> 'required')::boolean, false) and v = '' then
      raise exception 'Preencha: %', fld ->> 'label';
    end if;
    if char_length(v) > 500 then raise exception 'Resposta muito longa: %', fld ->> 'label'; end if;
  end loop;

  select h.owner_id into owner from public.houses h where h.id = ev.house_id;
  paid := ev.price_cents > 0 and public.payments_enabled(owner);
  if paid then
    if ev.starts_at > now() + interval '30 days' then
      raise exception 'As reservas pagas deste ritual abrem 30 dias antes da data.';
    end if;
    if ev.price_cents > public.payment_max_cents() then
      raise exception 'Este valor passa do limite para pagamento pela plataforma. Combine direto com a casa.';
    end if;
    if not public.house_accepted_terms(owner) then raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.'; end if;
    if not exists (select 1 from public.house_payment_accounts a where a.owner_id = owner and a.charges_enabled) then
      raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.';
    end if;
    if not public.has_client_terms(auth.uid()) or not public.has_recent_consent(auth.uid(), 'dados_sensiveis') then
      raise exception 'Aceite as condições da reserva para continuar.';
    end if;
  end if;
  insert into public.reservations (event_id, user_id, status, expires_at, answers)
  values (p_event, auth.uid(),
          case when paid then 'aguardando_pagamento'::reservation_status else 'confirmada'::reservation_status end,
          case when paid then now() + interval '15 minutes' else now() end,
          (select coalesce(jsonb_object_agg(x ->> 'id', btrim(coalesce(p_answers ->> (x ->> 'id'), ''))), '{}'::jsonb)
             from jsonb_array_elements(ev.intake_fields) as x))
  returning id into rid;

  if paid then
    insert into public.payments (reservation_id, provider, gross_cents, status, fee_rule_version, fee_cents)
    values (rid, 'stripe', ev.price_cents, 'pendente', 'v2-2026-10', public.fee_cents(ev.price_cents, 'ritual'));
  end if;
  return rid;
exception when unique_violation then
  raise exception 'Você já tem vaga neste ritual.';
end $function$;

-- FIM DO PASSO 12
