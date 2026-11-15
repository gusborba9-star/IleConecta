-- PASSO 245: 0118_proposta_de_horario_pelo_chat — parte 3 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) A casa confere o horário ANTES de enviar
create or replace function public.check_proposal_slot(p_service uuid, p_start timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  reason text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into svc from public.services where id = p_service;
  if not found or not public.is_house_owner(svc.house_id) then raise exception 'Serviço não encontrado.'; end if;
  if p_start is null or p_start < now() + interval '30 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'passado', 'message', 'Escolha um horário daqui a pelo menos 30 minutos.');
  end if;
  if p_start > now() + interval '180 days' then
    return jsonb_build_object('ok', false, 'reason', 'longe', 'message', 'Escolha um horário dentro dos próximos 180 dias.');
  end if;
  reason := public.schedule_conflict(svc.house_id, p_start, p_start + make_interval(mins => coalesce(svc.duration_min, 60)));
  if reason is not null then
    return jsonb_build_object('ok', false, 'reason', reason, 'message', public.schedule_conflict_text(reason) || ' Escolha outro horário.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.check_proposal_slot(uuid, timestamptz) from public, anon;

grant execute on function public.check_proposal_slot(uuid, timestamptz) to authenticated;

-- ============ 7) A casa envia a proposta (mensagem + cartão no chat)
create or replace function public.propose_schedule(p_service uuid, p_client uuid, p_start timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  me uuid := auth.uid();
  owner uuid;
  chk jsonb;
  conv uuid;
  pid uuid;
  fin timestamptz;
  price_txt text;
begin
  if me is null then raise exception 'Entre na sua conta.'; end if;
  select * into svc from public.services where id = p_service;
  if not found or not svc.active or not public.is_house_owner(svc.house_id) then raise exception 'Serviço não encontrado.'; end if;
  select h.owner_id into owner from public.houses h where h.id = svc.house_id;
  if p_client is null or p_client = me or p_client = owner then raise exception 'Escolha o cliente da conversa.'; end if;
  if not exists (select 1 from public.profiles where id = p_client) then raise exception 'Pessoa não encontrada.'; end if;

  -- trava a casa: duas propostas simultâneas não passam juntas pela mesma checagem
  perform 1 from public.houses where id = svc.house_id for update;
  chk := public.check_proposal_slot(p_service, p_start);
  if not (chk ->> 'ok')::boolean then raise exception '%', chk ->> 'message'; end if;

  if (select count(*) from public.schedule_proposals where house_id = svc.house_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Limite de propostas por dia atingido. Tente amanhã.';
  end if;

  update public.schedule_proposals set status = 'expirada'
   where service_id = p_service and client_id = p_client and status = 'aberta' and expires_at <= now();
  -- uma proposta nova no mesmo serviço substitui a anterior ainda aberta
  update public.schedule_proposals set status = 'cancelada'
   where service_id = p_service and client_id = p_client and status = 'aberta';

  conv := public.open_conversation(p_client);
  fin := p_start + make_interval(mins => coalesce(svc.duration_min, 60));
  insert into public.schedule_proposals (house_id, service_id, client_id, conversation_id, starts_at, ends_at, price_cents)
  values (svc.house_id, p_service, p_client, conv, p_start, fin, svc.price_cents)
  returning id into pid;

  price_txt := case when svc.price_cents = 0 then 'sem valor' else
    'R$ ' || regexp_replace((svc.price_cents / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g') || ',' || lpad((svc.price_cents % 100)::text, 2, '0') end;
  perform set_config('app.proposal', '1', true);
  insert into public.messages (conversation_id, sender_id, text, from_assistant, action)
  values (conv, me, 'Proposta de horário: ' || svc.title || ' · ' || public.proposal_when_text(p_start) || ' · ' || price_txt,
          false, jsonb_build_object('target', 'proposal', 'id', pid));
  perform set_config('app.proposal', '', true);
  return jsonb_build_object('ok', true, 'id', pid, 'conversation_id', conv);
end $$;

revoke all on function public.propose_schedule(uuid, uuid, timestamptz) from public, anon;

grant execute on function public.propose_schedule(uuid, uuid, timestamptz) to authenticated;
