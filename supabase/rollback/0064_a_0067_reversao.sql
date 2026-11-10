-- Reversão das migrations 0064–0067 (somente se necessário). Gerada do esquema 0063 == produção em 2026-11-09.
-- As colunas novas (stripe_events.attempts/lease_token/locked_until, payments.provider_*_ref, events.duration_min) são aditivas e ficam.
begin;
drop trigger if exists trg_events_schedule on public.events;
drop trigger if exists payments_guard_identity on public.payments;
drop function if exists public.events_schedule_guard() cascade;
drop function if exists public.can_view_profile(p uuid) cascade;
drop function if exists public.post_like_counts(p_posts uuid[]) cascade;
drop function if exists public.acquire_stripe_event(p_id text, p_type text, p_account text, p_payload jsonb, p_lease_seconds integer) cascade;
drop function if exists public.finish_stripe_event(p_id text, p_token uuid, p_outcome text, p_error text) cascade;
drop function if exists public.confirm_payment_for(p_payment uuid, p_provider text, p_provider_ref text, p_account text) cascade;
drop function if exists public.confirm_payment_row(p_payment uuid) cascade;
drop function if exists public.payment_identity_matches(p payments, p_provider text, p_ref text, p_account text) cascade;
drop function if exists public.payment_recorded_amounts(p_payment uuid) cascade;
drop function if exists public.payments_guard_identity() cascade;
drop function if exists public.payments_missing_processor_fee(p_limit integer) cascade;
drop function if exists public.payments_missing_provider_refs(p_limit integer) cascade;
drop function if exists public.payments_provider_anomalies(p_limit integer) cascade;
drop function if exists public.record_processor_fee_for(p_payment uuid, p_provider text, p_provider_ref text, p_account text, p_fee_cents bigint, p_method text) cascade;
drop function if exists public.record_provider_refs_for(p_payment uuid, p_provider text, p_provider_ref text, p_account text, p_payment_ref text, p_charge_ref text) cascade;
drop function if exists public.settlement_mode(p_provider text) cascade;
drop policy if exists profiles_read on public.profiles; drop policy if exists likes_read on public.post_likes;
create policy profiles_read on public.profiles for select to public using (true);
create policy likes_read on public.post_likes for select to public using (true);
CREATE OR REPLACE FUNCTION public.accept_staff_invite(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.house_staff_invites; h public.houses;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar.'; end if;
  select * into i from public.house_staff_invites where token = p_token and used_at is null and expires_at > now();
  if i.token is null then raise exception 'Este convite expirou ou já foi usado.'; end if;
  select * into h from public.houses where id = i.house_id;
  if h.owner_id = auth.uid() then raise exception 'Este é o convite da sua própria casa.'; end if;
  if (select count(*) from public.house_staff where house_id = h.id) >= public.house_seat_allowance(h.id) then raise exception 'A casa não tem acesso disponível agora.'; end if;
  if exists (select 1 from public.houses where owner_id = auth.uid()) then raise exception 'Use uma conta de cliente para atender pela casa.'; end if;
  if exists (select 1 from public.house_staff where user_id = auth.uid()) then raise exception 'Você já atende por uma casa.'; end if;
  insert into public.house_staff (house_id, user_id, name, perms) values (i.house_id, auth.uid(), i.name, i.perms);
  update public.house_staff_invites set used_at = now() where token = p_token;
  return h.name;
end $function$
;
CREATE OR REPLACE FUNCTION public.available_slots(p_service uuid, p_from date DEFAULT NULL::date, p_days integer DEFAULT 14)
 RETURNS TABLE(slot timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  svc public.services%rowtype;
  first_day date;
  n_days integer := least(greatest(coalesce(p_days, 14), 1), 31);
begin
  select * into svc from public.services where id = p_service;
  if not found or not svc.active or not svc.bookable then return; end if;
  first_day := coalesce(p_from, (now() at time zone 'America/Sao_Paulo')::date);
  return query
  select t.s from (
    select ((d::date)::timestamp + a.start_time + make_interval(mins => n * svc.duration_min)) at time zone 'America/Sao_Paulo' as s,
           ((d::date)::timestamp + a.start_time + make_interval(mins => (n + 1) * svc.duration_min)) at time zone 'America/Sao_Paulo' as e
      from generate_series(first_day::timestamp, (first_day + (n_days - 1))::timestamp, interval '1 day') d
      join public.house_availability a on a.house_id = svc.house_id and a.weekday = extract(dow from d)::int
      cross join lateral generate_series(0, 287) n
     where (n + 1) * svc.duration_min <= extract(epoch from (a.end_time - a.start_time))::int / 60
  ) t
  where t.s >= now() + interval '2 hours'
    and not exists (
      select 1 from public.service_orders o
       where o.house_id = svc.house_id and o.scheduled_at is not null
         and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
         and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(t.s, t.e))
    and not exists (
      select 1 from public.house_blocks b
       where b.house_id = svc.house_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(t.s, t.e))
  order by t.s;
end $function$
;
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

  fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, case when pay.reservation_id is not null then 'ritual' else 'servico' end));
  net := pay.gross_cents - fee;

  update public.payments set status = 'estornado' where id = pay.id;
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, hid, 'bruto', -pay.gross_cents, pay.fee_rule_version, 'Estorno (cancelamento antes do início)'),
         (pay.id, hid, 'plataforma', -fee, pay.fee_rule_version, 'Estorno da comissão da plataforma'),
         (pay.id, hid, 'casa', -net, pay.fee_rule_version, 'Estorno do valor da casa');

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
end $function$
;
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

  fee := coalesce(pay.fee_cents, public.fee_cents(pay.gross_cents, case when pay.reservation_id is not null then 'ritual' else 'servico' end));
  net := pay.gross_cents - fee;

  update public.payments set status = 'estornado' where id = pay.id;
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, rr.house_id, 'bruto', -pay.gross_cents, pay.fee_rule_version, 'Estorno (reembolso aprovado)'),
         (pay.id, rr.house_id, 'plataforma', -fee, pay.fee_rule_version, 'Estorno da comissão da plataforma'),
         (pay.id, rr.house_id, 'casa', -net, pay.fee_rule_version, 'Estorno do valor da casa');

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
end $function$
;
CREATE OR REPLACE FUNCTION public.confirm_payment(p_provider_ref text)
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
  select * into pay from public.payments where provider_ref = p_provider_ref for update;
  if not found then return 'desconhecido'; end if;
  if pay.status = 'confirmado' then return 'ja_confirmado'; end if;
  if pay.status not in ('pendente', 'falhou') then return 'ignorado'; end if;
  if pay.member_due_id is not null then return public.confirm_member_due_payment(pay.id); end if; direct := pay.provider = 'stripe';

  if pay.order_id is not null then
    select * into ord from public.service_orders where id = pay.order_id for update;
    update public.payments set status = 'confirmado', confirmed_at = now() where id = pay.id;
    suffix := case when ord.stages_total > 1 then ' (etapa ' || pay.stage_no || ' de ' || ord.stages_total || ')' else '' end;

    -- Etapas 2+: o pedido já existe. Se ele foi cancelado/reembolsado, o valor volta; senão, só lança a receita.
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
end $function$
;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.is_conversation_member(c uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = (select auth.uid()));
$function$
;
CREATE OR REPLACE FUNCTION public.is_house_owner(h uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.houses where id = h and owner_id = (select auth.uid()));
$function$
;
CREATE OR REPLACE FUNCTION public.join_event_waitlist(p_event uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.events%rowtype;
  owner uuid;
  cname text;
  added integer;
  pos integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para entrar na fila.'; end if;
  select * into ev from public.events where id = p_event;
  if not found or ev.status <> 'publicado' or ev.starts_at <= now() or ev.started_at is not null then
    raise exception 'Este ritual não está aberto para a fila de espera.';
  end if;
  if public.is_house_owner(ev.house_id) then raise exception 'A casa não entra na própria fila.'; end if;
  if public.event_taken(p_event) < ev.seats_total then raise exception 'Ainda há vagas: reserve a sua agora.'; end if;
  if exists (select 1 from public.reservations r where r.event_id = p_event and r.user_id = auth.uid()
              and (r.status = 'confirmada' or (r.status = 'aguardando_pagamento' and r.expires_at > now()))) then
    raise exception 'Você já tem vaga neste ritual.';
  end if;
  insert into public.event_waitlist (event_id, user_id) values (p_event, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    select h.owner_id into owner from public.houses h where h.id = ev.house_id;
    select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = auth.uid();
    insert into public.notifications (user_id, text, href)
      values (owner, cname || ' entrou na fila de espera: ' || ev.title || '.', '/casa/' || owner || '?aba=rituais');
  end if;
  select count(*)::int into pos from public.event_waitlist w
   where w.event_id = p_event and w.created_at <= (select created_at from public.event_waitlist where event_id = p_event and user_id = auth.uid());
  return pos;
end $function$
;
CREATE OR REPLACE FUNCTION public.notify_waitlist_on_free_seat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.events%rowtype;
  owner uuid;
  free integer;
  w record;
begin
  if old.status in ('confirmada', 'aguardando_pagamento') and new.status in ('cancelada', 'expirada', 'reembolso_pendente') then
    select * into ev from public.events where id = new.event_id;
    if not found or ev.status <> 'publicado' or ev.starts_at <= now() or ev.started_at is not null then return new; end if;
    free := ev.seats_total - public.event_taken(ev.id);
    if free <= 0 then return new; end if;
    select h.owner_id into owner from public.houses h where h.id = ev.house_id;
    for w in
      select id, user_id from public.event_waitlist
       where event_id = ev.id and notified_at is null order by created_at limit free
    loop
      update public.event_waitlist set notified_at = now() where id = w.id;
      insert into public.notifications (user_id, text, href)
        values (w.user_id, 'Abriu uma vaga em "' || ev.title || '". Reserve antes que acabe.', '/casa/' || owner || '?aba=rituais');
    end loop;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.peer_info(p_other uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, is_house boolean, online boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, coalesce(nullif(p.display_name, ''), 'Usuário'), p.avatar_url,
         (p.account_type::text = 'casa'),
         coalesce(p.last_seen_at > now() - interval '35 seconds', false)
  from public.profiles p
  where p.id = p_other and auth.uid() is not null;
$function$
;
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
  if ev.started_at is not null or ev.starts_at <= now() then raise exception 'As reservas deste ritual foram encerradas.'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  select (select count(*) from public.house_staff where house_id = new.house_id)
       + (select count(*) from public.house_staff_invites where house_id = new.house_id and used_at is null and expires_at > now())
    into n;
  if n >= public.house_seat_allowance(new.house_id) then
    raise exception 'O seu plano não tem acesso disponível. Contrate um acesso extra.';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.fee_cents(p_gross bigint, p_kind text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  bps integer;
begin
  bps := case p_kind when 'ritual' then 1500 when 'servico' then 400 when 'servico_pix' then 400 when 'mensalidade' then 400 end;
  if bps is null or p_gross is null or p_gross < 0 then raise exception 'Valor ou tipo de taxa inválido.'; end if;
  return (p_gross * bps + 5000) / 10000;
end $function$
;
CREATE OR REPLACE FUNCTION public.stage_amount_cents(p_total bigint, p_stages integer, p_stage integer)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_total is null or p_stages is null or p_stage is null or p_stages < 1 or p_stage < 1 or p_stage > p_stages then null
    when p_stage = 1 then p_total / p_stages + p_total % p_stages
    else p_total / p_stages end;
$function$
;
CREATE OR REPLACE FUNCTION public.events_guard_seats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and new.seats_total < public.event_taken(new.id) then
    raise exception 'Já existem % vagas reservadas; não é possível reduzir abaixo disso.', public.event_taken(new.id);
  end if;
  return new;
end $function$
;
commit;
