-- Preparo para pagamentos pelo Asaas (continua desligado: features.payments).
-- 1) house_payment_accounts: conta da casa no Asaas (sem chaves; só ids e estado). A casa e a administração leem.
-- 2) payments: dados do Pix e da garantia (escrow); índice único da referência do provedor.
-- 3) asaas_events: avisos do Asaas, gravados uma vez cada (idempotência). Só funções do servidor acessam.
-- 4) Reserva paga só abre 30 dias antes do ritual (a garantia do Asaas dura no máximo 45 dias).
-- Rode no SQL Editor. É seguro repetir.

create table if not exists public.house_payment_accounts (
  house_id uuid primary key references public.houses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  asaas_account_id text,
  asaas_wallet_id text,
  status text not null default 'pendente' check (status in ('pendente', 'em_analise', 'ativa', 'recusada', 'suspensa')),
  escrow_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.house_payment_accounts enable row level security;
drop policy if exists hpa_read on public.house_payment_accounts;
create policy hpa_read on public.house_payment_accounts for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());
-- Sem políticas de escrita: só funções do servidor gravam.

alter table public.payments add column if not exists pix_payload text;
alter table public.payments add column if not exists pix_expires_at timestamptz;
alter table public.payments add column if not exists escrow_id text;
alter table public.payments add column if not exists split_done_at timestamptz;
create unique index if not exists payments_provider_ref_uq on public.payments (provider, provider_ref) where provider_ref is not null;

create table if not exists public.asaas_events (
  id text primary key,
  event text not null,
  payment_ref text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
alter table public.asaas_events enable row level security;
-- Sem políticas: leitura e escrita só pelo servidor (service_role).

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
    if ev.starts_at > now() + interval '30 days' then
      raise exception 'As reservas pagas deste ritual abrem 30 dias antes da data.';
    end if;
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

revoke all on function public.reserve_event(uuid, jsonb) from public, anon;
grant execute on function public.reserve_event(uuid, jsonb) to authenticated;
