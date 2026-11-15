-- PASSO 243: 0118_proposta_de_horario_pelo_chat — parte 1 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
