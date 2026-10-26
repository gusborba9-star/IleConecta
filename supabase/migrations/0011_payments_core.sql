-- Núcleo de pagamentos (SEM cobrança real): taxas, vaga segurada, razão contábil e repasse retido 72h.
-- Fica DESLIGADO: sem features.payments ligado, as reservas seguem como hoje (confirmadas na hora).
-- O gateway (Asaas) será ligado numa etapa seguinte. Rode no SQL Editor. É seguro repetir.

-- Pagamentos ficam em platform_settings 'features' -> payments. Ao contrário dos outros recursos,
-- AUSENTE = DESLIGADO (dinheiro só com ligação explícita): state "on" liga para todos; "beta" só para os donos de casa em beta_houses.
create or replace function public.payments_enabled(p_owner uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case f ->> 'state'
             when 'on' then true
             when 'beta' then p_owner is not null and (f -> 'beta_houses') ? p_owner::text
             else false end
    from (select value -> 'payments' as f from public.platform_settings where key = 'features') x
    where jsonb_typeof(f) = 'object'
  ), false);
$$;

-- Mesma regra do paymentsCore.js: bps (17% ritual, 5% serviço Pix), metade para cima.
create or replace function public.fee_cents(p_gross bigint, p_kind text)
returns bigint language plpgsql immutable as $$
declare
  bps integer;
begin
  bps := case p_kind when 'ritual' then 1700 when 'servico_pix' then 500 end;
  if bps is null or p_gross is null or p_gross < 0 then raise exception 'Valor ou tipo de taxa inválido.'; end if;
  return (p_gross * bps + 5000) / 10000;
end $$;

-- Uma cobrança ativa por reserva e um repasse por ritual.
create unique index if not exists payments_one_active_per_reservation
  on public.payments (reservation_id) where status in ('pendente', 'confirmado');
create unique index if not exists payouts_one_per_event on public.payouts (event_id);

-- Reserva: com pagamentos ligados e ritual pago, a vaga fica segurada por 15 min aguardando o Pix.
create or replace function public.reserve_event(p_event uuid, p_answers jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  fld jsonb;
  v text;
  rid uuid;
  paid boolean;
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

  paid := ev.price_cents > 0 and public.payments_enabled((select h.owner_id from public.houses h where h.id = ev.house_id));
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

-- Cancelar: reserva paga vira "reembolso_pendente" (o dinheiro nunca some em silêncio); a vaga é liberada.
create or replace function public.cancel_reservation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  paid boolean;
begin
  select exists (select 1 from public.payments p where p.reservation_id = p_id and p.status = 'confirmado') into paid;
  update public.reservations r
     set status = case when paid then 'reembolso_pendente'::reservation_status else 'cancelada'::reservation_status end
   where r.id = p_id and r.user_id = auth.uid() and r.status in ('confirmada', 'aguardando_pagamento')
     and exists (select 1 from public.events e where e.id = r.event_id and e.started_at is null and e.starts_at > now());
  if not found then raise exception 'Não foi possível cancelar esta reserva.'; end if;
  update public.payments set status = 'falhou' where reservation_id = p_id and status = 'pendente';
end $$;

-- Confirmação de pagamento (chamada só pelo servidor, após validar o webhook do gateway). Idempotente.
create or replace function public.confirm_payment(p_provider_ref text)
returns text language plpgsql security definer set search_path = public as $$
declare
  pay public.payments%rowtype;
  res public.reservations%rowtype;
  ev public.events%rowtype;
  fee bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  select * into pay from public.payments where provider_ref = p_provider_ref for update;
  if not found then return 'desconhecido'; end if;
  if pay.status = 'confirmado' then return 'ja_confirmado'; end if;
  if pay.status not in ('pendente', 'falhou') then return 'ignorado'; end if;

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
  -- Três lançamentos por venda: bruto = plataforma (taxa) + casa (líquido).
  insert into public.ledger_entries (payment_id, house_id, entry_type, amount_cents, fee_rule_version, note)
  values (pay.id, ev.house_id, 'bruto', pay.gross_cents, pay.fee_rule_version, 'Vaga em ritual'),
         (pay.id, ev.house_id, 'plataforma', fee, pay.fee_rule_version, 'Taxa de 17% em rituais'),
         (pay.id, ev.house_id, 'casa', pay.gross_cents - fee, pay.fee_rule_version, 'Líquido da casa (retido até 72h após o ritual)');

  insert into public.payouts (house_id, event_id, amount_cents, eligible_at, status)
  values (ev.house_id, ev.id, pay.gross_cents - fee,
          coalesce(ev.ends_at, ev.starts_at) + interval '72 hours', 'bloqueado')
  on conflict (event_id) do update
     set amount_cents = public.payouts.amount_cents + excluded.amount_cents
   where public.payouts.status = 'bloqueado';
  return 'confirmado';
end $$;

-- Repasses cujo prazo (72h após o ritual) passou ficam elegíveis. Chamada pelo servidor.
create or replace function public.release_due_payouts()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Não autorizado.'; end if;
  update public.payouts po set status = 'elegivel'
   where po.status = 'bloqueado' and po.eligible_at <= now()
     and exists (select 1 from public.events e where e.id = po.event_id and e.status <> 'cancelado');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.confirm_payment(text) from public, anon, authenticated;
revoke all on function public.release_due_payouts() from public, anon, authenticated;
grant execute on function public.confirm_payment(text) to service_role;
grant execute on function public.release_due_payouts() to service_role;
grant execute on function public.payments_enabled(uuid) to authenticated;
