-- Pedidos de serviço contratados pela plataforma (trabalhos, jogos etc. à distância/sigilo).
-- Presencial ou pago direto à casa NÃO passa por aqui. Pix: 5% de comissão; valor retido 72h após a conclusão.
-- A casa inicia e conclui; o cliente é avisado nas duas etapas. Com pagamentos desligados, o pedido nasce confirmado (sem cobrança).
-- Rode no SQL Editor. É seguro repetir.

create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  house_id uuid not null references public.houses(id) on delete restrict,
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  price_cents bigint not null check (price_cents >= 0),
  note text check (char_length(note) <= 800),
  status text not null default 'confirmado' check (status in
    ('aguardando_pagamento', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'expirado', 'reembolso_pendente', 'reembolsado')),
  expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_orders_house on public.service_orders (house_id, created_at desc);
create index if not exists service_orders_client on public.service_orders (client_id, created_at desc);
create unique index if not exists service_orders_one_open
  on public.service_orders (service_id, client_id) where status in ('aguardando_pagamento', 'confirmado', 'em_andamento');

alter table public.service_orders enable row level security;
drop policy if exists service_orders_read on public.service_orders;
create policy service_orders_read on public.service_orders for select
  using (client_id = (select auth.uid()) or public.is_house_owner(house_id));
-- Sem políticas de escrita: tudo passa pelas funções abaixo.

-- Cobrança e repasse também podem nascer de um pedido de serviço (e não só de uma reserva de ritual).
alter table public.payments alter column reservation_id drop not null;
alter table public.payments add column if not exists order_id uuid references public.service_orders(id);
alter table public.payments drop constraint if exists payments_one_source;
alter table public.payments add constraint payments_one_source check ((reservation_id is null) <> (order_id is null));
create unique index if not exists payments_one_active_per_order
  on public.payments (order_id) where status in ('pendente', 'confirmado');

alter table public.payouts alter column event_id drop not null;
alter table public.payouts add column if not exists order_id uuid references public.service_orders(id);
alter table public.payouts drop constraint if exists payouts_one_source;
alter table public.payouts add constraint payouts_one_source check ((event_id is null) <> (order_id is null));
create unique index if not exists payouts_one_per_order on public.payouts (order_id);

-- Cliente contrata um serviço (remoto/sigilo) pela plataforma.
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

-- A casa inicia o trabalho: o cliente é avisado.
create or replace function public.start_service_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  hname text;
  owner uuid;
begin
  select * into o from public.service_orders where id = p_order for update;
  if not found or not public.is_house_owner(o.house_id) then raise exception 'Pedido não encontrado.'; end if;
  if o.status <> 'confirmado' then raise exception 'Este pedido não pode ser iniciado agora.'; end if;
  update public.service_orders set status = 'em_andamento', started_at = now(), updated_at = now() where id = p_order;
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = o.house_id;
  insert into public.notifications (user_id, text, href)
  values (o.client_id, 'Começou: ' || o.title || '. ' || hname || ' iniciou o seu trabalho.', '/casa/' || owner || '?aba=servicos');
end $$;

-- A casa conclui o trabalho: o cliente é avisado e começam as 72h de retenção do repasse.
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
  update public.payouts set eligible_at = now() + interval '72 hours' where order_id = p_order and status = 'bloqueado';
  select h.name, h.owner_id into hname, owner from public.houses h where h.id = o.house_id;
  insert into public.notifications (user_id, text, href)
  values (o.client_id, 'Concluído: ' || o.title || '. ' || hname || ' finalizou o seu trabalho.', '/casa/' || owner || '?aba=servicos');
end $$;

-- Cancelar antes de começar (cliente ou casa). Pedido já pago vira reembolso pendente.
create or replace function public.cancel_service_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.service_orders%rowtype;
  owner uuid;
  paid boolean;
  other uuid;
begin
  select * into o from public.service_orders where id = p_order for update;
  if not found or not (o.client_id = auth.uid() or public.is_house_owner(o.house_id)) then raise exception 'Pedido não encontrado.'; end if;
  if o.status not in ('aguardando_pagamento', 'confirmado') then raise exception 'Este pedido não pode mais ser cancelado.'; end if;
  select exists (select 1 from public.payments p where p.order_id = p_order and p.status = 'confirmado') into paid;
  update public.service_orders
     set status = case when paid then 'reembolso_pendente' else 'cancelado' end, updated_at = now()
   where id = p_order;
  update public.payments set status = 'falhou' where order_id = p_order and status = 'pendente';
  select h.owner_id into owner from public.houses h where h.id = o.house_id;
  other := case when auth.uid() = o.client_id then owner else o.client_id end;
  insert into public.notifications (user_id, text, href)
  values (other, 'Pedido cancelado: ' || o.title || '.', '/casa/' || owner || '?aba=servicos');
end $$;

-- Confirmação de pagamento: agora cobre reservas de ritual (17%) e pedidos de serviço (5% no Pix). Só o servidor chama.
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  select * into pay from public.payments where provider_ref = p_provider_ref for update;
  if not found then return 'desconhecido'; end if;
  if pay.status = 'confirmado' then return 'ja_confirmado'; end if;
  if pay.status not in ('pendente', 'falhou') then return 'ignorado'; end if;

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
    fee := public.fee_cents(pay.gross_cents, 'servico_pix');
    insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
    values (pay.id, ord.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Serviço contratado pela plataforma'),
           (pay.id, ord.house_id, 'plataforma', fee, pay.fee_rule_version, 'Comissão de 5% (Pix)'),
           (pay.id, ord.house_id, 'casa', pay.gross_cents - fee, pay.fee_rule_version, 'Líquido da casa (retido até 72h após a conclusão)');
    insert into public.payouts (house_id, order_id, amount_cents, eligible_at, status)
    values (ord.house_id, ord.id, pay.gross_cents - fee, 'infinity', 'bloqueado');
    select h.owner_id into owner from public.houses h where h.id = ord.house_id;
    select coalesce(nullif(p.display_name, ''), 'Um cliente') into cname from public.profiles p where p.id = ord.client_id;
    insert into public.notifications (user_id, text, href)
    values (owner, 'Novo pedido pago: ' || ord.title || ' — de ' || cname || '.', '/casa/' || owner || '?aba=servicos');
    return 'confirmado';
  end if;

  select * into res from public.reservations where id = pay.reservation_id for update;
  select * into ev from public.events where id = res.event_id for update;

  update public.payments set status = 'confirmado', confirmed_at = now() where id = pay.id;

  -- Pagou depois de a vaga vencer e o ritual lotou, ou o cliente já tem outra vaga, ou o ritual foi cancelado: reembolso pendente, sem receita.
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

  fee := public.fee_cents(pay.gross_cents, 'ritual');
  -- Três lançamentos por venda: bruto = plataforma (17%, já inclui a taxa do provedor) + casa (83%).
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, ev.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Vaga em ritual'),
         (pay.id, ev.house_id, 'plataforma', fee, pay.fee_rule_version, 'Taxa de 17% (inclui a taxa do provedor de cobrança)'),
         (pay.id, ev.house_id, 'casa', pay.gross_cents - fee, pay.fee_rule_version, 'Líquido da casa (retido até 72h após o ritual)');

  insert into public.payouts (house_id, event_id, amount_cents, eligible_at, status)
  values (ev.house_id, ev.id, pay.gross_cents - fee,
          coalesce(ev.ends_at, ev.starts_at) + interval '72 hours', 'bloqueado')
  on conflict (event_id) do update
     set amount_cents = public.payouts.amount_cents + excluded.amount_cents
   where public.payouts.status = 'bloqueado';
  return 'confirmado';
end $$;

-- Repasses elegíveis (prazo de 72h vencido). Pedidos de serviço só têm prazo depois de concluídos ('infinity' antes).
create or replace function public.release_due_payouts()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  update public.payouts po set status = 'elegivel'
   where po.status = 'bloqueado' and po.eligible_at <= now()
     and (po.event_id is null or exists (select 1 from public.events e where e.id = po.event_id and e.status <> 'cancelado'));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.create_service_order(uuid, text) from public, anon;
revoke all on function public.start_service_order(uuid) from public, anon;
revoke all on function public.finish_service_order(uuid) from public, anon;
revoke all on function public.cancel_service_order(uuid) from public, anon;
grant execute on function public.create_service_order(uuid, text) to authenticated;
grant execute on function public.start_service_order(uuid) to authenticated;
grant execute on function public.finish_service_order(uuid) to authenticated;
grant execute on function public.cancel_service_order(uuid) to authenticated;
revoke all on function public.confirm_payment(text) from public, anon, authenticated;
revoke all on function public.release_due_payouts() from public, anon, authenticated;
grant execute on function public.confirm_payment(text) to service_role;
grant execute on function public.release_due_payouts() to service_role;

-- Pedidos novos e mudanças de estado chegam na hora para as duas pontas (a regra de leitura já restringe quem recebe).
do $$ begin
  alter publication supabase_realtime add table public.service_orders;
exception when duplicate_object then null; when undefined_object then null; end $$;
