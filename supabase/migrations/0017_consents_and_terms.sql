-- Aceites jurídicos versionados, retenção em dias úteis e prazo de 30 dias para relatar problema.
-- 1) legal_consents: cada aceite (checkout de ritual, checkout de serviço, dados sensíveis, termos da casa) fica gravado com
--    data/hora, versão do texto, conta, IP e navegador. Só de acréscimo. O cliente vê os próprios; a administração vê todos.
-- 2) Com pagamentos ligados, reservar vaga e contratar serviço exigem o aceite do checkout feito nas últimas 2 horas e o aceite
--    de dados sensíveis; e a casa precisa ter aceitado os termos da casa para vender pela plataforma.
-- 3) Repasse: 72 horas ÚTEIS após a conclusão (segunda a sexta, sem feriados da tabela holidays). Ritual só libera repasse depois de concluído.
-- 4) O relato de problema com a entrega passa de 7 para 30 dias após a conclusão (CDC art. 26).
-- Rode no SQL Editor. É seguro repetir.

-- ============ 1) Aceites ============
create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  doc_key text not null check (doc_key in ('checkout_ritual', 'checkout_servico', 'dados_sensiveis', 'termos_casa')),
  doc_version text not null check (char_length(doc_version) between 1 and 60),
  context_id uuid,
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);
create index if not exists legal_consents_user on public.legal_consents (user_id, doc_key, accepted_at desc);
alter table public.legal_consents enable row level security;
drop policy if exists legal_consents_read on public.legal_consents;
create policy legal_consents_read on public.legal_consents for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
-- Sem políticas de escrita: só record_consent grava.

create or replace function public.record_consent(p_doc text, p_version text, p_context uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  hdr json;
  ip_txt text;
  ua text;
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_doc not in ('checkout_ritual', 'checkout_servico', 'dados_sensiveis', 'termos_casa') then raise exception 'Documento inválido.'; end if;
  if coalesce(btrim(p_version), '') = '' or char_length(p_version) > 60 then raise exception 'Versão inválida.'; end if;
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  ip_txt := nullif(btrim(split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), '');
  ua := left(coalesce(hdr ->> 'user-agent', ''), 300);
  insert into public.legal_consents (user_id, doc_key, doc_version, context_id, ip, user_agent)
  values (auth.uid(), p_doc, btrim(p_version), p_context, ip_txt, nullif(ua, ''))
  returning id into cid;
  return cid;
end $$;
revoke all on function public.record_consent(text, text, uuid) from public, anon;
grant execute on function public.record_consent(text, text, uuid) to authenticated;

-- Aceite recente do usuário (usado na reserva/contratação paga).
create or replace function public.has_recent_consent(p_user uuid, p_doc text, p_minutes integer default 120)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.legal_consents c
                  where c.user_id = p_user and c.doc_key = p_doc and c.accepted_at > now() - make_interval(mins => p_minutes));
$$;
revoke all on function public.has_recent_consent(uuid, text, integer) from public, anon, authenticated;

-- A casa já aceitou os termos da casa (em qualquer versão)?
create or replace function public.house_accepted_terms(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.legal_consents c where c.user_id = p_owner and c.doc_key = 'termos_casa');
$$;
revoke all on function public.house_accepted_terms(uuid) from public, anon;
grant execute on function public.house_accepted_terms(uuid) to authenticated;

-- ============ 2) Reserva paga exige aceites ============
create or replace function public.reserve_event(p_event uuid, p_answers jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
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
  if ev.started_at is not null or ev.starts_at <= now() then raise exception 'As reservas deste ritual foram encerradas.'; end if;
  if public.is_house_owner(ev.house_id) then raise exception 'A casa não reserva vaga no próprio ritual.'; end if;

  -- Libera reservas vencidas deste ritual (inclusive a do próprio cliente, que pode tentar de novo).
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
    if not public.house_accepted_terms(owner) then raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.'; end if;
    if not public.has_recent_consent(auth.uid(), 'checkout_ritual') or not public.has_recent_consent(auth.uid(), 'dados_sensiveis') then
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
    insert into public.payments (reservation_id, provider, gross_cents, status, fee_rule_version)
    values (rid, 'asaas', ev.price_cents, 'pendente', 'v1-2026-10');
  end if;
  return rid;
exception when unique_violation then
  raise exception 'Você já tem vaga neste ritual.';
end $$;

-- ============ 2) Contratação paga de serviço exige aceites ============
create or replace function public.create_service_order(p_service uuid, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  owner uuid;
  hname text;
  cname text;
  oid uuid;
  paid boolean;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para contratar.'; end if;
  select * into svc from public.services where id = p_service;
  if not found or not svc.active then raise exception 'Este serviço não está disponível.'; end if;
  if public.is_house_owner(svc.house_id) then raise exception 'A casa não contrata o próprio serviço.'; end if;
  if svc.delivery = 'presencial' then raise exception 'Este serviço é presencial: combine direto com a casa.'; end if;
  if char_length(coalesce(p_note, '')) > 800 then raise exception 'O pedido ficou muito longo.'; end if;
  select h.owner_id, h.name into owner, hname from public.houses h where h.id = svc.house_id;

  update public.service_orders set status = 'expirado'
   where client_id = auth.uid() and service_id = p_service and status = 'aguardando_pagamento' and expires_at <= now();
  update public.payments p set status = 'falhou'
   where p.status = 'pendente' and exists (select 1 from public.service_orders o where o.id = p.order_id and o.status = 'expirado');

  paid := svc.price_cents > 0 and public.payments_enabled(owner);
  if paid then
    if not public.house_accepted_terms(owner) then raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.'; end if;
    if not public.has_recent_consent(auth.uid(), 'checkout_servico') or not public.has_recent_consent(auth.uid(), 'dados_sensiveis') then
      raise exception 'Aceite as condições da contratação para continuar.';
    end if;
  end if;
  insert into public.service_orders (service_id, house_id, client_id, title, price_cents, note, status, expires_at)
  values (svc.id, svc.house_id, auth.uid(), svc.title, svc.price_cents, nullif(btrim(coalesce(p_note, '')), ''),
          case when paid then 'aguardando_pagamento' else 'confirmado' end,
          case when paid then now() + interval '30 minutes' else null end)
  returning id into oid;

  if paid then
    insert into public.payments (order_id, provider, gross_cents, status, fee_rule_version)
    values (oid, 'asaas', svc.price_cents, 'pendente', 'v1-2026-10');
  else
    select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = auth.uid();
    insert into public.notifications (user_id, text, href)
    values (owner, 'Novo pedido: ' || svc.title || ' — de ' || cname || '.', '/casa/' || owner || '?aba=servicos');
  end if;
  return oid;
exception when unique_violation then
  raise exception 'Você já tem um pedido em aberto deste serviço.';
end $$;

-- ============ 3) 72 horas úteis ============
create table if not exists public.holidays (
  day date primary key,
  name text not null
);
alter table public.holidays enable row level security;
-- Sem políticas: só as funções (security definer) e o painel via SQL leem/gravam.

insert into public.holidays (day, name) values
  ('2026-10-12', 'Nossa Senhora Aparecida'), ('2026-11-02', 'Finados'), ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Consciência Negra'), ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'), ('2027-03-26', 'Sexta-feira Santa'), ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'), ('2027-09-07', 'Independência'), ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'), ('2027-11-15', 'Proclamação da República'), ('2027-11-20', 'Consciência Negra'),
  ('2027-12-25', 'Natal')
on conflict (day) do nothing;

-- Mesmo horário, p_days dias úteis depois (America/Sao_Paulo), pulando fins de semana e feriados cadastrados.
create or replace function public.business_release_at(p_from timestamptz, p_days integer default 3)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  local_ts timestamp := p_from at time zone 'America/Sao_Paulo';
  d date := (p_from at time zone 'America/Sao_Paulo')::date;
  t time := (p_from at time zone 'America/Sao_Paulo')::time;
  n integer := 0;
begin
  while n < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from public.holidays h where h.day = d) then
      n := n + 1;
    end if;
  end loop;
  return (d + t) at time zone 'America/Sao_Paulo';
end $$;
revoke all on function public.business_release_at(timestamptz, integer) from public, anon, authenticated;

create or replace function public.finish_event(p_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  hname text;
  owner uuid;
  n integer;
begin
  select * into ev from public.events where id = p_event for update;
  if not found or not public.is_house_owner(ev.house_id) then raise exception 'Ritual não encontrado.'; end if;
  if ev.started_at is null then raise exception 'Inicie o ritual antes de concluir.'; end if;
  if ev.finished_at is not null or ev.status <> 'publicado' then raise exception 'Este ritual já foi concluído.'; end if;

  update public.events set finished_at = now(), status = 'encerrado' where id = p_event;
  update public.payouts set eligible_at = public.business_release_at(now())
   where event_id = p_event and status = 'bloqueado';
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = ev.house_id;

  insert into public.notifications (user_id, text, href)
  select r.user_id,
         'Concluído: ' || ev.title || '. ' || hname || ' finalizou o ritual.',
         '/casa/' || owner || '?aba=rituais'
    from public.reservations r
   where r.event_id = p_event and r.status = 'confirmada';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.finish_service_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  hname text;
  owner uuid;
begin
  select * into o from public.service_orders where id = p_order for update;
  if not found or not public.is_house_owner(o.house_id) then raise exception 'Pedido não encontrado.'; end if;
  if o.status <> 'em_andamento' then raise exception 'Inicie o trabalho antes de concluir.'; end if;
  update public.service_orders set status = 'concluido', finished_at = now(), updated_at = now() where id = p_order;
  update public.payouts set eligible_at = public.business_release_at(now()) where order_id = p_order and status = 'bloqueado';
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = o.house_id;
  insert into public.notifications (user_id, text, href)
  values (o.client_id, 'Concluído: ' || o.title || '. ' || hname || ' finalizou o seu trabalho.', '/casa/' || owner || '?aba=servicos');
end $$;

-- Repasse só fica elegível depois de o ritual ser concluído (e não só pela data marcada), sem reembolso em andamento.
create or replace function public.release_due_payouts()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  update public.payouts po set status = 'elegivel'
   where po.status = 'bloqueado' and po.eligible_at <= now()
     and (po.event_id is null or exists (select 1 from public.events e where e.id = po.event_id and e.status <> 'cancelado' and e.finished_at is not null))
     and not exists (
       select 1 from public.refund_requests rr
        where rr.status in ('pendente', 'aprovado')
          and (rr.order_id = po.order_id
               or rr.reservation_id in (select r.id from public.reservations r where r.event_id = po.event_id)));
  get diagnostics n = row_count;
  return n;
end $$;

-- ============ 4) Relato de problema: 30 dias ============
create or replace function public.request_refund(p_kind text, p_source uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  reason text := btrim(coalesce(p_reason, ''));
  pay public.payments%rowtype;
  res public.reservations%rowtype;
  ev public.events%rowtype;
  ord public.service_orders%rowtype;
  hid uuid;
  title text;
  finished timestamptz;
  owner uuid;
  rid uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if char_length(reason) < 10 then raise exception 'Conte o motivo com pelo menos 10 caracteres.'; end if;
  if char_length(reason) > 800 then raise exception 'O motivo é muito longo (máximo 800 caracteres).'; end if;

  if p_kind = 'reserva' then
    select * into res from public.reservations where id = p_source and user_id = auth.uid() for update;
    if not found then raise exception 'Reserva não encontrada.'; end if;
    select * into ev from public.events where id = res.event_id;
    if res.status <> 'confirmada' then raise exception 'Esta reserva não pode mais ser reembolsada por aqui.'; end if;
    if ev.started_at is null and ev.starts_at > now() then
      raise exception 'O ritual ainda não começou. Cancele a reserva e o reembolso é automático.';
    end if;
    select * into pay from public.payments where reservation_id = res.id and status = 'confirmado' limit 1;
    hid := ev.house_id; title := ev.title; finished := ev.finished_at;
  elsif p_kind = 'pedido' then
    select * into ord from public.service_orders where id = p_source and client_id = auth.uid() for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if ord.status in ('aguardando_pagamento', 'confirmado') then
      raise exception 'O trabalho ainda não começou. Cancele o pedido e o reembolso é automático.';
    end if;
    if ord.status not in ('em_andamento', 'concluido') then raise exception 'Este pedido não pode mais ser reembolsado por aqui.'; end if;
    select * into pay from public.payments where order_id = ord.id and status = 'confirmado' limit 1;
    hid := ord.house_id; title := ord.title; finished := ord.finished_at;
  else
    raise exception 'Tipo inválido.';
  end if;

  if pay.id is null then raise exception 'Não há pagamento confirmado para reembolsar.'; end if;
  if finished is not null and now() > finished + interval '30 days' then
    raise exception 'O prazo de 30 dias após a conclusão terminou. Fale com o suporte.';
  end if;

  begin
    insert into public.refund_requests (payment_id, reservation_id, order_id, house_id, client_id, kind, reason, amount_cents, status)
    values (pay.id, pay.reservation_id, pay.order_id, hid, auth.uid(), 'apos_inicio', reason, pay.gross_cents, 'pendente')
    returning id into rid;
  exception when unique_violation then
    raise exception 'Já existe um pedido de reembolso em andamento para este pagamento.';
  end;
  perform public.refund_log_add(rid, auth.uid(), 'pedido', reason);

  select h.owner_id into owner from public.houses h where h.id = hid;
  insert into public.notifications (user_id, text, href)
  values (owner, 'Pedido de reembolso: ' || title || '. O repasse deste valor fica retido até a decisão.', '/casa/' || owner);
  insert into public.notifications (user_id, text, href)
  select a.user_id, 'Novo pedido de reembolso para analisar: ' || title || '.', '/admin' from public.admins a;
  insert into public.notifications (user_id, text, href)
  values (auth.uid(), 'Recebemos o seu pedido de reembolso de ' || title || '. Você será avisado da decisão.', '/atividade');
  return rid;
end $$;

revoke all on function public.reserve_event(uuid, jsonb) from public, anon;
revoke all on function public.create_service_order(uuid, text) from public, anon;
revoke all on function public.finish_event(uuid) from public, anon;
revoke all on function public.finish_service_order(uuid) from public, anon;
revoke all on function public.request_refund(text, uuid, text) from public, anon;
revoke all on function public.release_due_payouts() from public, anon, authenticated;
grant execute on function public.reserve_event(uuid, jsonb) to authenticated;
grant execute on function public.create_service_order(uuid, text) to authenticated;
grant execute on function public.finish_event(uuid) to authenticated;
grant execute on function public.finish_service_order(uuid) to authenticated;
grant execute on function public.request_refund(text, uuid, text) to authenticated;
grant execute on function public.release_due_payouts() to service_role;
