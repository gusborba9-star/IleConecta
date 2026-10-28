-- Stripe Connect em cobrança direta (continua DESLIGADO: features.payments).
-- A casa recebe direto do cliente; a plataforma fica só com a comissão (application fee). O Stripe assume as perdas de
-- saldo negativo e cobra a própria tarifa da casa. Por isso, para pagamentos 'stripe' NÃO há repasse nem retenção nossa.
-- 1) Comissão: ritual 15%; serviço 4% (Pix e cartão à vista). 'servico_pix' vira sinônimo de 'servico'.
-- 2) payments: forma de pagamento, comissão fixada no checkout, conta Stripe da casa e tarifa do processador.
-- 3) house_payment_accounts: conta Stripe da casa e estado do cadastro.
-- 4) stripe_events: avisos do Stripe, gravados uma vez cada (idempotência).
-- 5) Teto por pagamento (padrão R$ 10.000): acima disso, combinar direto com a casa.
-- 6) reserve_event / create_service_order / confirm_payment / complete_refund adaptadas.
-- Rode no SQL Editor. É seguro repetir.

-- ============ 1) Comissão ============
create or replace function public.fee_cents(p_gross bigint, p_kind text)
returns bigint language plpgsql immutable as $$
declare
  bps integer;
begin
  bps := case p_kind when 'ritual' then 1500 when 'servico' then 400 when 'servico_pix' then 400 end;
  if bps is null or p_gross is null or p_gross < 0 then raise exception 'Valor ou tipo de taxa inválido.'; end if;
  return (p_gross * bps + 5000) / 10000;
end $$;

-- ============ 2) payments ============
alter table public.payments alter column provider set default 'stripe';
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists fee_cents bigint;
alter table public.payments add column if not exists stripe_account_id text;
alter table public.payments add column if not exists processor_fee_cents bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_method_chk') then
    alter table public.payments add constraint payments_method_chk check (payment_method is null or payment_method in ('pix', 'card'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_fee_chk') then
    alter table public.payments add constraint payments_fee_chk check (fee_cents is null or (fee_cents >= 0 and fee_cents <= gross_cents));
  end if;
end $$;

-- ============ 3) conta Stripe da casa ============
alter table public.house_payment_accounts add column if not exists provider text not null default 'stripe';
alter table public.house_payment_accounts add column if not exists stripe_account_id text;
alter table public.house_payment_accounts add column if not exists charges_enabled boolean not null default false;
alter table public.house_payment_accounts add column if not exists payouts_enabled boolean not null default false;
alter table public.house_payment_accounts add column if not exists requirements_due boolean not null default false;
create unique index if not exists hpa_stripe_account_uq on public.house_payment_accounts (stripe_account_id) where stripe_account_id is not null;

-- ============ 4) avisos do Stripe ============
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  account_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
alter table public.stripe_events enable row level security;
-- Sem políticas: leitura e escrita só pelo servidor (service_role).

-- ============ 5) teto por pagamento ============
-- Padrão R$ 10.000 (o Pix do Stripe tem limite por pagamento). Ajustável no painel: platform_settings 'payment_limits' {"max_cents": ...}.
create or replace function public.payment_max_cents()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'max_cents')::bigint from public.platform_settings where key = 'payment_limits'), 1000000);
$$;
grant execute on function public.payment_max_cents() to authenticated;

-- ============ 6a) reserva de vaga ============
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
    insert into public.payments (reservation_id, provider, gross_cents, status, fee_rule_version, fee_cents)
    values (rid, 'stripe', ev.price_cents, 'pendente', 'v2-2026-10', public.fee_cents(ev.price_cents, 'ritual'));
  end if;
  return rid;
exception when unique_violation then
  raise exception 'Você já tem vaga neste ritual.';
end $$;

-- ============ 6b) contratação de serviço ============
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
    if svc.price_cents > public.payment_max_cents() then
      raise exception 'Este valor passa do limite para pagamento pela plataforma. Combine direto com a casa.';
    end if;
    if not public.house_accepted_terms(owner) then raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.'; end if;
    if not exists (select 1 from public.house_payment_accounts a where a.owner_id = owner and a.charges_enabled) then
      raise exception 'Esta casa ainda não concluiu o cadastro para receber pagamentos.';
    end if;
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
    insert into public.payments (order_id, provider, gross_cents, status, fee_rule_version, fee_cents)
    values (oid, 'stripe', svc.price_cents, 'pendente', 'v2-2026-10', public.fee_cents(svc.price_cents, 'servico'));
  else
    select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = auth.uid();
    insert into public.notifications (user_id, text, href)
    values (owner, 'Novo pedido: ' || svc.title || ' — de ' || cname || '.', '/casa/' || owner || '?aba=servicos');
  end if;
  return oid;
exception when unique_violation then
  raise exception 'Você já tem um pedido em aberto deste serviço.';
end $$;

-- ============ 6c) confirmação do pagamento (só o servidor, após validar o aviso do Stripe) ============
-- Pagamento 'stripe': a casa já recebeu direto; não há repasse. Pagamentos de outro provedor seguem o caminho antigo.
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
    values (pay.id, ord.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Serviço contratado pela plataforma'),
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
    values (owner, 'Novo pedido pago: ' || ord.title || ' — de ' || cname || '.', '/casa/' || owner || '?aba=servicos');
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

-- Tarifa do Stripe cobrada da casa (informativa, vem do aviso do Stripe). Uma vez só por pagamento.
create or replace function public.record_processor_fee(p_provider_ref text, p_fee_cents bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  pay public.payments%rowtype;
  hid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  if p_fee_cents is null or p_fee_cents < 0 then raise exception 'Tarifa inválida.'; end if;
  select * into pay from public.payments where provider_ref = p_provider_ref for update;
  if not found or pay.processor_fee_cents is not null then return false; end if;
  update public.payments set processor_fee_cents = p_fee_cents where id = pay.id;
  select coalesce(e.house_id, o.house_id) into hid
    from public.payments p
    left join public.reservations r on r.id = p.reservation_id
    left join public.events e on e.id = r.event_id
    left join public.service_orders o on o.id = p.order_id
   where p.id = pay.id;
  if hid is not null then
    insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
    values (pay.id, hid, 'taxa_provedor', p_fee_cents, pay.fee_rule_version, 'Tarifa do Stripe (cobrada da casa)');
  end if;
  return true;
end $$;
revoke all on function public.record_processor_fee(text, bigint) from public, anon, authenticated;
grant execute on function public.record_processor_fee(text, bigint) to service_role;

-- ============ 6d) reembolso concluído ============
-- Chamada depois de o Stripe devolver o dinheiro (com a comissão). Em pagamento 'stripe' não há repasse a ajustar:
-- o estorno sai do saldo da casa e, se ela não tiver saldo, o prejuízo é do Stripe.
create or replace function public.complete_refund(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
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
end $$;
