-- EXEC-01: desacoplamento do provedor de pagamentos (Stripe segue como único ativo).
-- Versionada e idempotente, escrita contra as definições VIVAS lidas do banco (que conferem com as migrations 0001–0063).
-- NÃO aplicar sem revisão: nenhuma migration deste PR foi aplicada no Supabase remoto.
--
-- 1) Evento de aviso com trava atômica e DONO da trava (token por aquisição): worker antigo não finaliza a execução de outro.
-- 2) Confirmação por ID da linha travada: provedor + referência + conta conferidos sob o mesmo lock que confirma. Sem depender
--    de unicidade global de provider_ref.
-- 3) Identidade estrita da conta para pagamentos novos; histórico sem conta registrada marcado explicitamente (identity_strict=false).
-- 4) Tarifa do processador separada da confirmação, também por ID.
-- 5) Estorno reverte exatamente o que foi registrado no ledger (comissão e regra originais), nunca a regra comercial atual.
-- 6) Gatilho que impede trocar provedor/conta; regra de liquidação por provedor.

-- ============ 1) trava de eventos com dono ============
alter table public.stripe_events add column if not exists locked_until timestamptz;
alter table public.stripe_events add column if not exists attempts integer not null default 0;
alter table public.stripe_events add column if not exists lease_token uuid;

drop function if exists public.acquire_stripe_event(text, text, text, jsonb, integer);
drop function if exists public.finish_stripe_event(text, text, text);
drop function if exists public.payments_missing_processor_fee(integer);

-- Um único INSERT ... ON CONFLICT DO UPDATE ... WHERE decide. outcome: 'acquired' (lease_token identifica o dono),
-- 'done' (já concluído) ou 'busy' (outro worker detém a trava vigente).
create or replace function public.acquire_stripe_event(
  p_id text, p_type text, p_account text, p_payload jsonb, p_lease_seconds integer default 120
) returns table (outcome text, lease_token uuid) language plpgsql security definer set search_path = public as $$
declare got uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_id is null or p_id = '' then raise exception 'Evento sem identificador.'; end if;
  insert into public.stripe_events as e (id, type, account_id, payload, locked_until, attempts, lease_token)
  values (p_id, coalesce(p_type, ''), p_account, p_payload,
          now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 5)), 1, gen_random_uuid())
  on conflict (id) do update
     set locked_until = excluded.locked_until, attempts = e.attempts + 1, lease_token = excluded.lease_token
   where e.processed_at is null and (e.locked_until is null or e.locked_until < now())
  returning e.lease_token into got;
  if got is not null then return query select 'acquired'::text, got; return; end if;
  if exists (select 1 from public.stripe_events where id = p_id and processed_at is not null) then
    return query select 'done'::text, null::uuid; return;
  end if;
  return query select 'busy'::text, null::uuid;
end $$;

-- Só o dono atual da trava (token igual) pode concluir, rejeitar ou liberar. Devolve false quando não é o dono
-- (a lease venceu e outro worker assumiu, ou o evento já foi concluído): nada é alterado.
create or replace function public.finish_stripe_event(p_id text, p_token uuid, p_outcome text, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_token is null then return false; end if;
  if p_outcome = 'done' then
    update public.stripe_events set processed_at = now(), error = null, locked_until = null
     where id = p_id and lease_token = p_token and processed_at is null;
  elsif p_outcome = 'rejected' then
    update public.stripe_events set processed_at = now(), error = left('rejeitado: ' || coalesce(p_error, ''), 500), locked_until = null
     where id = p_id and lease_token = p_token and processed_at is null;
  elsif p_outcome = 'retry' then
    update public.stripe_events set error = left(coalesce(p_error, ''), 500), locked_until = null
     where id = p_id and lease_token = p_token and processed_at is null;
  else
    raise exception 'Resultado inválido.';
  end if;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ============ 3) identidade estrita (histórico marcado explicitamente) ============
-- identity_strict = true  : a transação só confirma/lança tarifa com provedor, referência E conta de origem iguais às registradas.
-- identity_strict = false : SOMENTE histórico Stripe que já tinha referência e nunca teve conta registrada (anterior a este controle).
-- Linhas novas nascem estritas. A marcação do histórico roda uma única vez (junto com a criação da coluna).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = 'identity_strict') then
    alter table public.payments add column identity_strict boolean not null default true;
    update public.payments set identity_strict = false
     where provider = 'stripe' and stripe_account_id is null and provider_ref is not null;
  end if;
end $$;

-- Mesmo critério para confirmar e para lançar tarifa.
create or replace function public.payment_identity_matches(p public.payments, p_provider text, p_ref text, p_account text)
returns boolean language sql immutable set search_path = public as $$
  select p.provider is not distinct from p_provider
     and p.provider_ref is not null and p.provider_ref is not distinct from p_ref
     and case when p.stripe_account_id is not null then p.stripe_account_id is not distinct from p_account
              else p.identity_strict = false end
$$;

-- ============ 2) confirmação por ID da linha travada ============
-- Corpo VIVO de confirm_payment, idêntico em efeitos financeiros, mas a linha vem por id (não por provider_ref).
CREATE OR REPLACE FUNCTION public.confirm_payment_row(p_payment uuid)
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
 select * into pay from public.payments where id = p_payment for update;
 if not found then return 'desconhecido'; end if;
 if pay.status = 'confirmado' then return 'ja_confirmado'; end if;
 if pay.status not in ('pendente', 'falhou') then return 'ignorado'; end if;
 if pay.member_due_id is not null then return public.confirm_member_due_payment(pay.id); end if; direct := pay.provider = 'stripe';
 if pay.order_id is not null then
 select * into ord from public.service_orders where id = pay.order_id for update;
 update public.payments set status = 'confirmado', confirmed_at = now() where id = pay.id;
 suffix := case when ord.stages_total > 1 then ' (etapa ' || pay.stage_no || ' de ' || ord.stages_total || ')' else '' end;
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
 end $function$;


-- Compatibilidade: confirm_payment(ref) continua existindo para chamadores antigos, agora delegando à versão por id.
-- Referência ambígua (mais de uma linha) não é presumida única: falha explicitamente.
create or replace function public.confirm_payment(p_provider_ref text)
returns text language plpgsql security definer set search_path = public as $$
declare n integer; pid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  select count(*), min(id::text)::uuid into n, pid from public.payments where provider_ref = p_provider_ref;
  if n = 0 then return 'desconhecido'; end if;
  if n > 1 then raise exception 'Referência de pagamento ambígua.'; end if;
  return public.confirm_payment_row(pid);
end $$;

-- Trava a linha por id, confere provedor + referência + conta SOB O MESMO LOCK e confirma essa mesma linha.
create or replace function public.confirm_payment_for(p_payment uuid, p_provider text, p_provider_ref text, p_account text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then return 'divergente'; end if;
  if not public.payment_identity_matches(pay, p_provider, p_provider_ref, p_account) then return 'divergente'; end if;
  return public.confirm_payment_row(pay.id);
end $$;

-- ============ 4) tarifa do processador por ID ============
-- Mesmo efeito de record_processor_fee (idempotente por processor_fee_cents), mas sobre a linha travada e validada por id.
-- Devolve 'registrada', 'ja_registrada' ou 'divergente'.
create or replace function public.record_processor_fee_for(
  p_payment uuid, p_provider text, p_provider_ref text, p_account text, p_fee_cents bigint, p_method text default null
) returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype; hid uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  if p_fee_cents is null or p_fee_cents < 0 then raise exception 'Tarifa inválida.'; end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found then return 'divergente'; end if;
  if not public.payment_identity_matches(pay, p_provider, p_provider_ref, p_account) then return 'divergente'; end if;
  if p_method in ('pix', 'card') and pay.payment_method is distinct from p_method then
    update public.payments set payment_method = p_method where id = pay.id;
  end if;
  if pay.processor_fee_cents is not null then return 'ja_registrada'; end if;
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
  return 'registrada';
end $$;

-- Confirmados sem tarifa conciliada (a rotina tenta de novo).
create or replace function public.payments_missing_processor_fee(p_limit integer default 25)
returns table (id uuid, provider text, provider_ref text, stripe_account_id text, identity_strict boolean, status text, member_due_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.' using errcode = '42501'; end if;
  return query
    select p.id, p.provider, p.provider_ref, p.stripe_account_id, p.identity_strict, p.status::text, p.member_due_id
      from public.payments p
     where p.status = 'confirmado' and p.processor_fee_cents is null
       and p.provider = 'stripe' and p.provider_ref is not null and p.stripe_account_id is not null
     order by p.id
     limit greatest(least(coalesce(p_limit, 25), 200), 1);
end $$;

-- ============ 5) estorno pelo que foi REGISTRADO ============
-- Valores efetivamente lançados no ledger da transação (líquidos de estornos anteriores) e a regra de comissão original.
-- Sem lançamentos, usa fee_cents gravado na própria transação; sem nenhum dos dois, falha — nunca recalcula pela regra atual.
create or replace function public.payment_recorded_amounts(p_payment uuid)
returns table (gross bigint, fee bigint, net bigint, version text)
language plpgsql stable security definer set search_path = public as $$
declare g bigint; f bigint; c bigint; v text; n integer; pay public.payments%rowtype;
begin
  select count(*),
         sum(amount_cents) filter (where entry_type = 'bruto'),
         sum(amount_cents) filter (where entry_type = 'plataforma'),
         sum(amount_cents) filter (where entry_type = 'casa'),
         (array_agg(fee_rule_version order by created_at) filter (where entry_type = 'bruto' and amount_cents > 0))[1]
    into n, g, f, c, v
    from public.ledger_entries where payment_id = p_payment and entry_type in ('bruto', 'plataforma', 'casa');
  select * into pay from public.payments where id = p_payment;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if n = 0 or g is null then
    if pay.fee_cents is null then raise exception 'Comissão registrada não encontrada para o estorno.'; end if;
    return query select pay.gross_cents, pay.fee_cents, pay.gross_cents - pay.fee_cents, pay.fee_rule_version;
    return;
  end if;
  if g <= 0 or coalesce(f, 0) < 0 or coalesce(c, 0) < 0 or g - coalesce(f, 0) <> coalesce(c, 0) then
    raise exception 'Lançamentos do pagamento inconsistentes para o estorno.';
  end if;
  return query select g, coalesce(f, 0), c, coalesce(v, pay.fee_rule_version);
end $$;

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
 v_gross bigint;
 v_ver text;
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
 select r.gross, r.fee, r.net, r.version into v_gross, fee, net, v_ver from public.payment_recorded_amounts(pay.id) r;
 update public.payments set status = 'estornado' where id = pay.id;
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, rr.house_id, 'bruto', -v_gross, v_ver, 'Estorno (reembolso aprovado)'),
 (pay.id, rr.house_id, 'plataforma', -fee, v_ver, 'Estorno da comissão da plataforma'),
 (pay.id, rr.house_id, 'casa', -net, v_ver, 'Estorno do valor da casa');
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
 end $function$;


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
 v_gross bigint;
 v_ver text;
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
 select r.gross, r.fee, r.net, r.version into v_gross, fee, net, v_ver from public.payment_recorded_amounts(pay.id) r;
 update public.payments set status = 'estornado' where id = pay.id;
 insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
 values (pay.id, hid, 'bruto', -v_gross, v_ver, 'Estorno (cancelamento antes do início)'),
 (pay.id, hid, 'plataforma', -fee, v_ver, 'Estorno da comissão da plataforma'),
 (pay.id, hid, 'casa', -net, v_ver, 'Estorno do valor da casa');
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
end $function$;


-- ============ 6) gatilho de identidade ============
-- provedor nunca muda; a conta de origem, depois de gravada, nunca muda; identity_strict nunca muda; a referência só muda
-- enquanto o pagamento está pendente (nova sessão de checkout). Vale para qualquer caminho de escrita.
create or replace function public.payments_guard_identity() returns trigger language plpgsql as $$
begin
  if new.provider is distinct from old.provider then
    raise exception 'O provedor de um pagamento não pode ser alterado.' using errcode = '23514';
  end if;
  if old.stripe_account_id is not null and new.stripe_account_id is distinct from old.stripe_account_id then
    raise exception 'A conta de origem de um pagamento não pode ser alterada.' using errcode = '23514';
  end if;
  if new.identity_strict is distinct from old.identity_strict then
    raise exception 'A marcação de identidade de um pagamento não pode ser alterada.' using errcode = '23514';
  end if;
  if old.provider_ref is not null and new.provider_ref is distinct from old.provider_ref and old.status::text <> 'pendente' then
    raise exception 'A referência de um pagamento só muda enquanto ele está pendente.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists payments_guard_identity on public.payments;
create trigger payments_guard_identity before update on public.payments
  for each row execute function public.payments_guard_identity();

-- 'direct' = cobrança direta (a casa recebe na própria conta; sem retenção de 72h, sem reserva, sem repasse da plataforma).
-- 'legacy_hold' = regra antiga de retenção, preservada só para pagamentos históricos de outros provedores.
create or replace function public.settlement_mode(p_provider text)
returns text language sql immutable set search_path = public as $$
  select case when p_provider = 'stripe' then 'direct' else 'legacy_hold' end
$$;

-- Pagamento Stripe nunca carrega depósito/repasse de retenção. NOT VALID: não reprova histórico, vale para linhas novas e alteradas.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_stripe_no_hold' and conrelid = 'public.payments'::regclass) then
    alter table public.payments
      add constraint payments_stripe_no_hold
      check (provider <> 'stripe' or (escrow_id is null and split_done_at is null)) not valid;
  end if;
end $$;

-- ============ permissões ============
revoke all on function public.acquire_stripe_event(text, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.finish_stripe_event(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.confirm_payment_row(uuid) from public, anon, authenticated;
revoke all on function public.confirm_payment(text) from public, anon, authenticated;
revoke all on function public.confirm_payment_for(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_processor_fee_for(uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.payments_missing_processor_fee(integer) from public, anon, authenticated;
revoke all on function public.payment_recorded_amounts(uuid) from public, anon, authenticated;
revoke all on function public.payment_identity_matches(public.payments, text, text, text) from public, anon, authenticated;
grant execute on function public.acquire_stripe_event(text, text, text, jsonb, integer) to service_role;
grant execute on function public.finish_stripe_event(text, uuid, text, text) to service_role;
grant execute on function public.confirm_payment_row(uuid) to service_role;
grant execute on function public.confirm_payment(text) to service_role;
grant execute on function public.confirm_payment_for(uuid, text, text, text) to service_role;
grant execute on function public.record_processor_fee_for(uuid, text, text, text, bigint, text) to service_role;
grant execute on function public.payments_missing_processor_fee(integer) to service_role;
grant execute on function public.payment_recorded_amounts(uuid) to service_role;
grant execute on function public.payment_identity_matches(public.payments, text, text, text) to service_role;
revoke all on function public.settlement_mode(text) from public, anon, authenticated;
revoke all on function public.payments_guard_identity() from public, anon, authenticated;
grant execute on function public.settlement_mode(text) to service_role;
