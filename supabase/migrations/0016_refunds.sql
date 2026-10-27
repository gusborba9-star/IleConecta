-- Reembolsos: fila de pedidos, decisão do administrador, estorno do razão e do repasse, com histórico.
-- Regras (da política do Ilê Conecta):
--  1) Antes de começar (ritual não iniciado / pedido não iniciado): o cliente cancela e o reembolso é automático (aprovado na hora).
--  2) Depois de começar: o cliente pede com motivo; o repasse da casa fica retido até a decisão; o administrador aprova ou recusa.
--     Pedido possível até 7 dias após a conclusão (as 72h de retenção valem para a casa; depois disso ainda dá para reembolsar,
--     e a casa fica com um débito se o repasse já tiver sido pago). Descontentamento simples ou má-fé: o administrador recusa.
--  3) Reembolso é sempre integral (parcial e desconto de custo de material ficam para uma decisão de negócio futura).
-- O dinheiro só volta pelo gateway: complete_refund é chamado pelo servidor (ou pelo administrador, para registrar um estorno manual).
-- Com pagamentos desligados nada disso aparece, pois não existem pagamentos confirmados. Rode no SQL Editor. É seguro repetir.

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  order_id uuid references public.service_orders(id) on delete set null,
  house_id uuid not null references public.houses(id) on delete restrict,
  client_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('antes_do_inicio', 'apos_inicio')),
  reason text check (reason is null or char_length(reason) between 10 and 800),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'reembolsado', 'cancelado')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 800),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists refund_one_open on public.refund_requests (payment_id) where status in ('pendente', 'aprovado');
create index if not exists refund_status on public.refund_requests (status, created_at desc);
create index if not exists refund_client on public.refund_requests (client_id, created_at desc);
create index if not exists refund_house on public.refund_requests (house_id, created_at desc);

alter table public.refund_requests enable row level security;
drop policy if exists refund_read on public.refund_requests;
create policy refund_read on public.refund_requests for select to authenticated
  using (client_id = (select auth.uid()) or public.is_house_owner(house_id) or public.is_admin());
-- Sem políticas de escrita: tudo passa pelas funções abaixo.

-- Histórico só de acréscimo (quem fez o quê e quando).
create table if not exists public.refund_log (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.refund_requests(id) on delete cascade,
  actor_id uuid,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.refund_log enable row level security;
drop policy if exists refund_log_read on public.refund_log;
create policy refund_log_read on public.refund_log for select to authenticated using (public.is_admin());

-- Débito da casa quando o reembolso sai depois de o repasse já ter sido pago (compensado nos repasses futuros).
create table if not exists public.house_debits (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete restrict,
  refund_id uuid not null unique references public.refund_requests(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
alter table public.house_debits enable row level security;
drop policy if exists house_debits_read on public.house_debits;
create policy house_debits_read on public.house_debits for select to authenticated
  using (public.is_house_owner(house_id) or public.is_admin());

-- O cliente também enxerga o pagamento dos próprios pedidos de serviço (a política original só cobria reservas de ritual).
drop policy if exists payments_read_orders on public.payments;
create policy payments_read_orders on public.payments for select to authenticated
  using (exists (select 1 from public.service_orders o where o.id = order_id and o.client_id = (select auth.uid())));

create or replace function public.refund_log_add(p_request uuid, p_actor uuid, p_action text, p_note text)
returns void language sql security definer set search_path = public as $$
  insert into public.refund_log (request_id, actor_id, action, note) values (p_request, p_actor, p_action, p_note);
$$;
revoke all on function public.refund_log_add(uuid, uuid, text, text) from public, anon, authenticated;

-- Reserva ou pedido pago que cai em "reembolso_pendente" (cancelamento antes do início, pagamento tardio, ritual cancelado)
-- vira, automaticamente, um reembolso já aprovado.
create or replace function public.open_auto_refund()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pay public.payments%rowtype;
  hid uuid;
  cid uuid;
  rid uuid;
begin
  if tg_table_name = 'reservations' then
    select * into pay from public.payments where reservation_id = new.id and status = 'confirmado' limit 1;
    select e.house_id into hid from public.events e where e.id = new.event_id;
    cid := new.user_id;
  else
    select * into pay from public.payments where order_id = new.id and status = 'confirmado' limit 1;
    hid := new.house_id;
    cid := new.client_id;
  end if;
  if pay.id is null or hid is null then return new; end if;
  insert into public.refund_requests (payment_id, reservation_id, order_id, house_id, client_id, kind, amount_cents, status, decided_at)
  values (pay.id, pay.reservation_id, pay.order_id, hid, cid, 'antes_do_inicio', pay.gross_cents, 'aprovado', now())
  on conflict (payment_id) where status in ('pendente', 'aprovado') do nothing
  returning id into rid;
  if rid is not null then
    perform public.refund_log_add(rid, null, 'aprovado_automatico', 'Cancelamento antes do início.');
    insert into public.notifications (user_id, text, href)
    values (cid, 'Seu reembolso foi aprovado e está sendo processado.', '/atividade');
  end if;
  return new;
end $$;
revoke all on function public.open_auto_refund() from public, anon, authenticated;

drop trigger if exists trg_auto_refund_res on public.reservations;
create trigger trg_auto_refund_res after update of status on public.reservations
  for each row when (new.status = 'reembolso_pendente' and old.status is distinct from new.status)
  execute function public.open_auto_refund();
drop trigger if exists trg_auto_refund_ord on public.service_orders;
create trigger trg_auto_refund_ord after update of status on public.service_orders
  for each row when (new.status = 'reembolso_pendente' and old.status is distinct from new.status)
  execute function public.open_auto_refund();

-- O cliente pede reembolso depois de o ritual/trabalho ter começado. p_kind: 'reserva' ou 'pedido'.
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
  if finished is not null and now() > finished + interval '7 days' then
    raise exception 'O prazo de 7 dias após a conclusão terminou. Fale com o suporte.';
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

-- O cliente desiste do pedido ainda não decidido.
create or replace function public.withdraw_refund_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.refund_requests set status = 'cancelado', updated_at = now()
   where id = p_id and client_id = auth.uid() and status = 'pendente';
  if not found then raise exception 'Pedido não encontrado ou já decidido.'; end if;
  perform public.refund_log_add(p_id, auth.uid(), 'desistencia', null);
end $$;

-- O administrador decide. Recusar exige uma justificativa (o cliente e a casa são avisados).
create or replace function public.decide_refund(p_id uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  rr public.refund_requests%rowtype;
  note text := btrim(coalesce(p_note, ''));
  owner uuid;
begin
  if not public.is_admin() then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  select * into rr from public.refund_requests where id = p_id for update;
  if not found or rr.status <> 'pendente' then raise exception 'Pedido não encontrado ou já decidido.'; end if;
  if not p_approve and char_length(note) < 5 then raise exception 'Explique o motivo da recusa.'; end if;
  if char_length(note) > 800 then raise exception 'Justificativa muito longa.'; end if;

  update public.refund_requests
     set status = case when p_approve then 'aprovado' else 'recusado' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(note, ''), updated_at = now()
   where id = p_id;
  perform public.refund_log_add(p_id, auth.uid(), case when p_approve then 'aprovado' else 'recusado' end, nullif(note, ''));

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

-- Reembolso executado: estorna pagamento, razão e repasse; libera a vaga. Só o servidor (gateway) ou um administrador
-- (para registrar um estorno feito à mão). Se o repasse já foi pago, nasce um débito da casa.
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

  fee := public.fee_cents(pay.gross_cents, case when pay.reservation_id is not null then 'ritual' else 'servico_pix' end);
  net := pay.gross_cents - fee;

  update public.payments set status = 'estornado' where id = pay.id;
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, rr.house_id, 'bruto', -pay.gross_cents, pay.fee_rule_version, 'Estorno (reembolso aprovado)'),
         (pay.id, rr.house_id, 'plataforma', -fee, pay.fee_rule_version, 'Estorno da taxa da plataforma'),
         (pay.id, rr.house_id, 'casa', -net, pay.fee_rule_version, 'Estorno do líquido da casa');

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
    (owner, case when result = 'estornado_com_debito'
                 then 'Um reembolso foi concluído depois do seu repasse. O valor será descontado dos próximos repasses.'
                 else 'Um reembolso foi concluído e retirado do seu repasse.' end, '/casa/' || owner);
  return result;
end $$;

-- Repasses com reembolso em andamento não ficam elegíveis (o dinheiro fica retido até a decisão).
create or replace function public.release_due_payouts()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  update public.payouts po set status = 'elegivel'
   where po.status = 'bloqueado' and po.eligible_at <= now()
     and (po.event_id is null or exists (select 1 from public.events e where e.id = po.event_id and e.status <> 'cancelado'))
     and not exists (
       select 1 from public.refund_requests rr
        where rr.status in ('pendente', 'aprovado')
          and (rr.order_id = po.order_id
               or rr.reservation_id in (select r.id from public.reservations r where r.event_id = po.event_id)));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.request_refund(text, uuid, text) from public, anon;
revoke all on function public.withdraw_refund_request(uuid) from public, anon;
revoke all on function public.decide_refund(uuid, boolean, text) from public, anon;
revoke all on function public.complete_refund(uuid) from public, anon;
revoke all on function public.release_due_payouts() from public, anon, authenticated;
grant execute on function public.request_refund(text, uuid, text) to authenticated;
grant execute on function public.withdraw_refund_request(uuid) to authenticated;
grant execute on function public.decide_refund(uuid, boolean, text) to authenticated;
grant execute on function public.complete_refund(uuid) to authenticated, service_role;
grant execute on function public.release_due_payouts() to service_role;

do $$ begin
  alter publication supabase_realtime add table public.refund_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;
