-- Teto de pagamento editável pelo admin + serviços de valor alto pagos em etapas (2 a 4 pagamentos do mesmo pedido).
-- Continua DESLIGADO: nada disso cobra enquanto features.payments estiver desligado.
-- 1) admin_set_setting aceita a chave 'payment_limits' ({"max_cents": ...}), com faixa segura e histórico.
-- 2) services.stages: a casa define em quantas etapas o serviço é pago (1 a 4). service_orders.stages_total guarda o plano aceito.
-- 3) payments.stage_no: um pagamento por etapa. Cada etapa respeita o teto e paga a própria comissão (4%).
-- 4) create_service_order: valor acima do teto exige que a casa tenha configurado etapas suficientes; cobra só a etapa 1.
-- 5) pay_next_stage: o cliente paga a próxima etapa (pedido já confirmado). confirm_payment: etapas 2+ só lançam a receita.
-- 6) Reembolso é sempre integral: cobre todas as etapas já pagas (automático, pedido e decisão do admin).
-- Rode no SQL Editor. É seguro repetir.

-- ============ 1) Teto editável no painel ============
-- A tabela só aceitava 3 chaves; inclui 'payment_limits'.
alter table public.platform_settings drop constraint if exists platform_settings_key_check;
alter table public.platform_settings add constraint platform_settings_key_check
  check (key in ('features', 'pricing', 'scopes', 'payment_limits'));

create or replace function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old_val jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_key not in ('features', 'pricing', 'scopes', 'payment_limits') then raise exception 'invalid_key'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
    raise exception 'invalid_value';
  end if;
  if p_key = 'payment_limits' then
    if jsonb_typeof(p_value -> 'max_cents') <> 'number'
       or (p_value ->> 'max_cents') !~ '^[0-9]+$'
       or (p_value ->> 'max_cents')::bigint not between 10000 and 10000000 then
      raise exception 'O teto por pagamento deve ficar entre R$ 100 e R$ 100.000.';
    end if;
  end if;
  select value into old_val from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), p_key, old_val, p_value);
end $$;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- ============ 2) e 3) Esquema das etapas ============
alter table public.services add column if not exists stages smallint not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'services_stages_chk') then
    alter table public.services add constraint services_stages_chk check (stages between 1 and 4);
  end if;
end $$;

alter table public.service_orders add column if not exists stages_total smallint not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_orders_stages_chk') then
    alter table public.service_orders add constraint service_orders_stages_chk check (stages_total between 1 and 4);
  end if;
end $$;

alter table public.payments add column if not exists stage_no smallint not null default 1;
drop index if exists public.payments_one_active_per_order;
create unique index if not exists payments_one_active_per_order_stage
  on public.payments (order_id, stage_no) where order_id is not null and status in ('pendente', 'confirmado');

-- Valor da etapa k de n: divisão em centavos inteiros; a 1ª etapa leva a sobra. A soma das etapas é sempre o total.
create or replace function public.stage_amount_cents(p_total bigint, p_stages integer, p_stage integer)
returns bigint language sql immutable as $$
  select case
    when p_total is null or p_stages is null or p_stage is null or p_stages < 1 or p_stage < 1 or p_stage > p_stages then null
    when p_stage = 1 then p_total / p_stages + p_total % p_stages
    else p_total / p_stages end;
$$;

-- ============ 4) Contratação de serviço com etapas ============
create or replace function public.create_service_order(p_service uuid, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  owner uuid;
  hname text;
  cname text;
  oid uuid;
  paid boolean;
  cap bigint;
  n integer;
  first_amt bigint;
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
  n := 1;
  if paid then
    cap := public.payment_max_cents();
    n := greatest(svc.stages, 1);
    if svc.price_cents > cap * 4 then
      raise exception 'Este valor passa do limite para pagamento pela plataforma. Combine direto com a casa.';
    end if;
    -- Cada etapa precisa caber no teto. Sem etapas suficientes configuradas pela casa, o pedido não é criado.
    if public.stage_amount_cents(svc.price_cents, n, 1) > cap then
      raise exception 'Este valor passa do limite por pagamento. A casa precisa dividir este serviço em mais etapas.';
    end if;
    if not public.house_accepted_terms(owner) then raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.'; end if;
    if not exists (select 1 from public.house_payment_accounts a where a.owner_id = owner and a.charges_enabled) then
      raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.';
    end if;
    if not public.has_recent_consent(auth.uid(), 'checkout_servico') or not public.has_recent_consent(auth.uid(), 'dados_sensiveis') then
      raise exception 'Aceite as condições da contratação para continuar.';
    end if;
  end if;
  insert into public.service_orders (service_id, house_id, client_id, title, price_cents, note, status, expires_at, stages_total)
  values (svc.id, svc.house_id, auth.uid(), svc.title, svc.price_cents, nullif(btrim(coalesce(p_note, '')), ''),
          case when paid then 'aguardando_pagamento' else 'confirmado' end,
          case when paid then now() + interval '30 minutes' else null end, n)
  returning id into oid;

  if paid then
    first_amt := public.stage_amount_cents(svc.price_cents, n, 1);
    insert into public.payments (order_id, provider, gross_cents, status, fee_rule_version, fee_cents, stage_no)
    values (oid, 'stripe', first_amt, 'pendente', 'v2-2026-10', public.fee_cents(first_amt, 'servico'), 1);
  else
    select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = auth.uid();
    insert into public.notifications (user_id, text, href)
    values (owner, 'Novo pedido: ' || svc.title || ' — de ' || cname || '.', '/casa/' || owner || '?aba=servicos');
  end if;
  return oid;
exception when unique_violation then
  raise exception 'Você já tem um pedido em aberto deste serviço.';
end $$;

-- ============ 5) Pagar a próxima etapa ============
create or replace function public.pay_next_stage(p_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  owner uuid;
  k integer;
  amt bigint;
  pid uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into o from public.service_orders where id = p_order and client_id = auth.uid() for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if o.status not in ('confirmado', 'em_andamento', 'concluido') then
    raise exception 'Este pedido não aceita mais pagamento de etapa.';
  end if;
  -- Etapa 1 precisa estar paga; a próxima é a menor sem pagamento confirmado.
  select s into k from generate_series(1, o.stages_total) s
   where not exists (select 1 from public.payments p where p.order_id = o.id and p.stage_no = s and p.status = 'confirmado')
   order by s limit 1;
  if k is null then raise exception 'Todas as etapas deste pedido já foram pagas.'; end if;
  if k = 1 then raise exception 'A primeira etapa ainda não foi paga.'; end if;
  -- Já existe cobrança aberta desta etapa: devolve a mesma.
  select p.id into pid from public.payments p where p.order_id = o.id and p.stage_no = k and p.status = 'pendente';
  if pid is not null then return pid; end if;

  select h.owner_id into owner from public.houses h where h.id = o.house_id;
  if not public.payments_enabled(owner)
     or not exists (select 1 from public.house_payment_accounts a where a.owner_id = owner and a.charges_enabled) then
    raise exception 'Esta casa não está recebendo pagamentos agora. Fale com o suporte.';
  end if;
  amt := public.stage_amount_cents(o.price_cents, o.stages_total, k);
  if amt > public.payment_max_cents() then
    raise exception 'Esta etapa passa do limite por pagamento. Fale com o suporte.';
  end if;
  insert into public.payments (order_id, provider, gross_cents, status, fee_rule_version, fee_cents, stage_no)
  values (o.id, 'stripe', amt, 'pendente', 'v2-2026-10', public.fee_cents(amt, 'servico'), k)
  returning id into pid;
  return pid;
end $$;
revoke all on function public.pay_next_stage(uuid) from public, anon;
grant execute on function public.pay_next_stage(uuid) to authenticated;
revoke all on function public.create_service_order(uuid, text) from public, anon;
grant execute on function public.create_service_order(uuid, text) to authenticated;

-- ============ Reembolso integral: abre o pedido de uma pagamento (usado pelo gatilho e por pagamentos tardios) ============
create or replace function public.open_refund_for_payment(p_payment uuid, p_house uuid, p_client uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pay public.payments%rowtype;
  rid uuid;
begin
  select * into pay from public.payments where id = p_payment;
  if not found or pay.status <> 'confirmado' then return null; end if;
  insert into public.refund_requests (payment_id, reservation_id, order_id, house_id, client_id, kind, amount_cents, status, decided_at)
  values (pay.id, pay.reservation_id, pay.order_id, p_house, p_client, 'antes_do_inicio', pay.gross_cents, 'aprovado', now())
  on conflict (payment_id) where status in ('pendente', 'aprovado') do nothing
  returning id into rid;
  if rid is not null then
    perform public.refund_log_add(rid, null, 'aprovado_automatico', 'Cancelamento antes do início.');
  end if;
  return rid;
end $$;
revoke all on function public.open_refund_for_payment(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.open_auto_refund()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pay record;
  hid uuid;
  cid uuid;
  opened boolean := false;
begin
  if tg_table_name = 'reservations' then
    select e.house_id into hid from public.events e where e.id = new.event_id;
    cid := new.user_id;
    for pay in select id from public.payments where reservation_id = new.id and status = 'confirmado' order by stage_no loop
      opened := (public.open_refund_for_payment(pay.id, hid, cid) is not null) or opened;
    end loop;
  else
    hid := new.house_id;
    cid := new.client_id;
    for pay in select id from public.payments where order_id = new.id and status = 'confirmado' order by stage_no loop
      opened := (public.open_refund_for_payment(pay.id, hid, cid) is not null) or opened;
    end loop;
  end if;
  if opened and hid is not null then
    insert into public.notifications (user_id, text, href)
    values (cid, 'Seu reembolso foi aprovado e está sendo processado.', '/atividade');
  end if;
  return new;
end $$;
revoke all on function public.open_auto_refund() from public, anon, authenticated;

-- ============ confirm_payment com etapas ============
create or replace function public.confirm_payment(p_provider_ref text)
returns text language plpgsql security definer set search_path = public as $$
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
  direct := pay.provider = 'stripe';

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

    if ord.status <> 'aguardando_pagamento'
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
    values (owner, 'Novo pedido pago: ' || ord.title || suffix || ' — de ' || cname || '.', '/casa/' || owner || '?aba=servicos');
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
end $$;
revoke all on function public.confirm_payment(text) from public, anon, authenticated;
grant execute on function public.confirm_payment(text) to service_role;

-- ============ 6) Reembolso após o início: cobre todas as etapas pagas ============
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
  first_rid uuid;
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
    hid := ev.house_id; title := ev.title; finished := ev.finished_at;
  elsif p_kind = 'pedido' then
    select * into ord from public.service_orders where id = p_source and client_id = auth.uid() for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if ord.status in ('aguardando_pagamento', 'confirmado') then
      raise exception 'O trabalho ainda não começou. Cancele o pedido e o reembolso é automático.';
    end if;
    if ord.status not in ('em_andamento', 'concluido') then raise exception 'Este pedido não pode mais ser reembolsado por aqui.'; end if;
    hid := ord.house_id; title := ord.title; finished := ord.finished_at;
  else
    raise exception 'Tipo inválido.';
  end if;

  if not exists (select 1 from public.payments p
                  where p.status = 'confirmado'
                    and ((p_kind = 'reserva' and p.reservation_id = res.id) or (p_kind = 'pedido' and p.order_id = ord.id))) then
    raise exception 'Não há pagamento confirmado para reembolsar.';
  end if;
  if finished is not null and now() > finished + interval '30 days' then
    raise exception 'O prazo de 30 dias após a conclusão terminou. Fale com o suporte.';
  end if;

  -- Um pedido de reembolso por pagamento confirmado (reembolso é sempre integral: todas as etapas pagas).
  for pay in select * from public.payments p
              where p.status = 'confirmado'
                and ((p_kind = 'reserva' and p.reservation_id = res.id) or (p_kind = 'pedido' and p.order_id = ord.id))
              order by p.stage_no loop
    begin
      insert into public.refund_requests (payment_id, reservation_id, order_id, house_id, client_id, kind, reason, amount_cents, status)
      values (pay.id, pay.reservation_id, pay.order_id, hid, auth.uid(), 'apos_inicio', reason, pay.gross_cents, 'pendente')
      returning id into rid;
    exception when unique_violation then
      raise exception 'Já existe um pedido de reembolso em andamento para este pagamento.';
    end;
    perform public.refund_log_add(rid, auth.uid(), 'pedido', reason);
    first_rid := coalesce(first_rid, rid);
  end loop;

  select h.owner_id into owner from public.houses h where h.id = hid;
  insert into public.notifications (user_id, text, href)
  values (owner, 'Pedido de reembolso: ' || title || '. O repasse deste valor fica retido até a decisão.', '/casa/' || owner);
  insert into public.notifications (user_id, text, href)
  select a.user_id, 'Novo pedido de reembolso para analisar: ' || title || '.', '/admin' from public.admins a;
  insert into public.notifications (user_id, text, href)
  values (auth.uid(), 'Recebemos o seu pedido de reembolso de ' || title || '. Você será avisado da decisão.', '/atividade');
  return first_rid;
end $$;
revoke all on function public.request_refund(text, uuid, text) from public, anon;
grant execute on function public.request_refund(text, uuid, text) to authenticated;

-- A decisão do admin vale para todas as etapas do mesmo pedido (os pedidos irmãos pendentes seguem a mesma decisão).
create or replace function public.decide_refund(p_id uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  rr public.refund_requests%rowtype;
  sib uuid;
  note text := btrim(coalesce(p_note, ''));
  owner uuid;
begin
  if not public.is_admin() then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  select * into rr from public.refund_requests where id = p_id for update;
  if not found or rr.status <> 'pendente' then raise exception 'Pedido não encontrado ou já decidido.'; end if;
  if not p_approve and char_length(note) < 5 then raise exception 'Explique o motivo da recusa.'; end if;
  if char_length(note) > 800 then raise exception 'Justificativa muito longa.'; end if;

  for sib in select r.id from public.refund_requests r
              where r.status = 'pendente'
                and (r.id = p_id or (rr.order_id is not null and r.order_id = rr.order_id and r.client_id = rr.client_id))
              order by r.created_at, r.id for update loop
    update public.refund_requests
       set status = case when p_approve then 'aprovado' else 'recusado' end,
           decided_by = auth.uid(), decided_at = now(), decision_note = nullif(note, ''), updated_at = now()
     where id = sib;
    perform public.refund_log_add(sib, auth.uid(), case when p_approve then 'aprovado' else 'recusado' end, nullif(note, ''));
  end loop;

  select h.owner_id into owner from public.houses h where h.id = rr.house_id;
  if p_approve then
    insert into public.notifications (user_id, text, href) values
      (rr.client_id, 'Seu reembolso foi aprovado e está sendo processado.', '/atividade'),
      (owner, 'Um reembolso foi aprovado. O valor correspondente sai do seu repasse.', '/casa/' || owner);
  else
    insert into public.notifications (user_id, text, href) values
      (rr.client_id, 'Seu pedido de reembolso não foi aprovado. ' || note, '/atividade'),
      (owner, 'Um pedido de reembolso foi recusado. O seu repasse segue o prazo normal.', '/casa/' || owner);
  end if;
end $$;
revoke all on function public.decide_refund(uuid, boolean, text) from public, anon;
grant execute on function public.decide_refund(uuid, boolean, text) to authenticated;
