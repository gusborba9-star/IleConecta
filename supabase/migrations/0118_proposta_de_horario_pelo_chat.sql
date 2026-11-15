-- 0118 — Proposta de horário pelo chat.
-- A casa combina o horário com o cliente na conversa e envia uma proposta (serviço + dia/hora).
-- O cliente recebe no chat um cartão "Confirmar e pagar" que abre o pagamento normal da plataforma
-- (mesmos termos, mesmo reembolso integral até a casa iniciar o trabalho).
--  * A proposta NÃO reserva o horário. A vaga só é reservada quando o cliente toca em pagar (reserva de 15 min já existente).
--  * Vale 24 horas; a casa pode cancelar antes. Expirada ou cancelada, deixa de abrir o pagamento.
--  * Antes de enviar, a casa é avisada se o horário já está ocupado na agenda dela (pedido, ritual, bloqueio, data do calendário).
--  * Se o horário for tomado entre a proposta e o pagamento, o cliente é avisado e a casa é avisada para propor outro.
--  * Vale também para serviço presencial sem agenda própria: é a casa quem escolhe o horário.

-- ============ 1) Tabela de propostas (sem escrita direta: tudo passa pelas funções abaixo)
create table if not exists public.schedule_proposals (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents bigint not null check (price_cents >= 0),
  status text not null default 'aberta' check (status in ('aberta', 'cancelada', 'expirada', 'indisponivel')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  order_id uuid references public.service_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists schedule_proposals_client_idx on public.schedule_proposals (client_id, created_at desc);
create index if not exists schedule_proposals_house_idx on public.schedule_proposals (house_id, created_at desc);
create unique index if not exists schedule_proposals_one_open
  on public.schedule_proposals (service_id, client_id) where status = 'aberta';
alter table public.schedule_proposals enable row level security;
drop policy if exists schedule_proposals_read on public.schedule_proposals;
create policy schedule_proposals_read on public.schedule_proposals for select to authenticated
  using (client_id = (select auth.uid()) or public.is_house_owner(house_id));
revoke all on public.schedule_proposals from anon, authenticated;
grant select on public.schedule_proposals to authenticated;

-- ============ 2) O botão do chat pode apontar para uma proposta
alter table public.messages drop constraint if exists messages_action_shape;
alter table public.messages add constraint messages_action_shape check (
  action is null or (
    jsonb_typeof(action) = 'object'
    and action ->> 'target' in ('ritual', 'service', 'proposal')
    and (action ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
  )
);
-- Só o servidor grava mensagem com proposta (ninguém forja cartão de proposta pelo insert direto).
create or replace function public.messages_proposal_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.action ->> 'target' = 'proposal' and coalesce(current_setting('app.proposal', true), '') <> '1' then
    raise exception 'Proposta só pode ser enviada pela função própria.';
  end if;
  return new;
end $$;
drop trigger if exists trg_messages_proposal_guard on public.messages;
create trigger trg_messages_proposal_guard before insert on public.messages
  for each row execute function public.messages_proposal_guard();

-- ============ 3) Quem recebeu uma proposta aberta pode contratar mesmo serviço privado (não listado)
create or replace function public.service_offered_to_me(p_service uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
       where m.from_assistant and m.action ->> 'target' = 'service' and m.action ->> 'id' = p_service::text)
    or exists (
      select 1 from public.schedule_proposals sp
       where sp.service_id = p_service and sp.client_id = auth.uid() and sp.status = 'aberta' and sp.expires_at > now()));
$$;
revoke all on function public.service_offered_to_me(uuid) from public, anon, authenticated;

-- ============ 4) Serviço presencial sem agenda própria pode ser contratado quando a casa propõe o horário
do $$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.create_service_order(uuid, text)'::regprocedure);
  if position('app.booking' in substr(src, position('delivery = ''presencial''' in src), 120)) > 0 then return; end if;
  patched := replace(src, 'if svc.delivery = ''presencial'' and not svc.bookable then raise exception',
                          'if svc.delivery = ''presencial'' and not svc.bookable and coalesce(current_setting(''app.booking'', true), '''') <> ''1'' then raise exception');
  if patched = src then raise exception 'create_service_order: trecho presencial nao encontrado'; end if;
  execute patched;
end $$;

-- ============ 5) Conflito de agenda (interna): devolve o motivo ou null se o intervalo está livre
create or replace function public.schedule_conflict(p_house uuid, p_start timestamptz, p_end timestamptz, p_ignore_order uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.service_orders o
              where o.house_id = p_house and o.scheduled_at is not null and (p_ignore_order is null or o.id <> p_ignore_order)
                and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
                and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(p_start, p_end)) then
    return 'pedido';
  end if;
  if exists (select 1 from public.events ev
              where ev.house_id = p_house and ev.status = 'publicado' and ev.duration_min is not null
                and tstzrange(ev.starts_at, ev.starts_at + make_interval(mins => ev.duration_min)) && tstzrange(p_start, p_end)) then
    return 'ritual';
  end if;
  if exists (select 1 from public.house_blocks b
              where b.house_id = p_house and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end)) then
    return 'bloqueio';
  end if;
  if exists (select 1 from public.house_calendar_blocks(p_house, (p_start at time zone 'America/Sao_Paulo')::date, (p_end at time zone 'America/Sao_Paulo')::date) c
              where tstzrange(c.starts_at, c.ends_at) && tstzrange(p_start, p_end)) then
    return 'calendario';
  end if;
  return null;
end $$;
revoke all on function public.schedule_conflict(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.schedule_conflict_text(p_reason text)
returns text language sql immutable set search_path = public as $$
  select case p_reason
    when 'pedido' then 'Já existe um pedido neste horário.'
    when 'ritual' then 'Há um ritual publicado neste horário.'
    when 'bloqueio' then 'Este horário está bloqueado na sua agenda.'
    when 'calendario' then 'Há uma data do seu calendário neste horário.'
    else 'Este horário não está livre.' end;
$$;
revoke all on function public.schedule_conflict_text(text) from public, anon, authenticated;

create or replace function public.proposal_when_text(p_at timestamptz)
returns text language sql immutable set search_path = public as $$
  select (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[extract(dow from p_at at time zone 'America/Sao_Paulo')::int + 1]
         || ' ' || to_char(p_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
$$;
revoke all on function public.proposal_when_text(timestamptz) from public, anon, authenticated;

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

-- ============ 8) Dados do cartão (casa e cliente da proposta)
create or replace function public.proposal_card(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.schedule_proposals%rowtype;
  svc public.services%rowtype;
  ord public.service_orders%rowtype;
  st text;
  me uuid := auth.uid();
begin
  select * into p from public.schedule_proposals where id = p_id;
  if not found or me is null or not (p.client_id = me or public.is_house_owner(p.house_id)) then return null; end if;
  select * into svc from public.services where id = p.service_id;
  st := p.status;
  if st = 'aberta' and p.expires_at <= now() then st := 'expirada'; end if;
  if p.order_id is not null then select * into ord from public.service_orders where id = p.order_id; end if;
  if ord.id is null then null;
  elsif ord.status in ('confirmado', 'em_andamento') then st := 'paga';
  elsif ord.status = 'concluido' then st := 'concluida';
  elsif ord.status in ('reembolso_pendente', 'reembolsado', 'cancelado') and st = 'aberta' then st := 'cancelada';
  end if;
  return jsonb_build_object(
    'id', p.id, 'status', st, 'service_id', p.service_id, 'service_title', coalesce(svc.title, 'Serviço'),
    'starts_at', p.starts_at, 'when', public.proposal_when_text(p.starts_at), 'price_cents', p.price_cents,
    'expires_at', p.expires_at, 'order_id', p.order_id, 'mine_is_house', public.is_house_owner(p.house_id));
end $$;
revoke all on function public.proposal_card(uuid) from public, anon;
grant execute on function public.proposal_card(uuid) to authenticated;

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

-- ============ 10) A casa (ou o cliente, que recusa) cancela uma proposta aberta
create or replace function public.cancel_proposal(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare p public.schedule_proposals%rowtype;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into p from public.schedule_proposals where id = p_id for update;
  if not found or not (p.client_id = auth.uid() or public.is_house_owner(p.house_id)) then raise exception 'Proposta não encontrada.'; end if;
  if p.status <> 'aberta' then return false; end if;
  if p.order_id is not null and exists (select 1 from public.service_orders o where o.id = p.order_id and o.status in ('confirmado', 'em_andamento', 'concluido')) then
    raise exception 'Esta proposta já foi paga. Cancele pelo pedido.';
  end if;
  update public.schedule_proposals set status = 'cancelada' where id = p.id;
  return true;
end $$;
revoke all on function public.cancel_proposal(uuid) from public, anon;
grant execute on function public.cancel_proposal(uuid) to authenticated;

-- ============ 11) Exclusão de conta: propostas saem junto (cascata nas FKs). Nada mais a fazer aqui.
