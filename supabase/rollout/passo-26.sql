-- PASSO 26 de 30: 0071 — F4: tabelas e coluna do aviso
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 1) Identificação do aviso de passagem de atendimento (substitui a busca por texto).
alter table public.notifications add column if not exists kind text;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind is null or kind in ('handoff'));

-- 2) Estado por conversa.
create table if not exists public.conversation_handoff (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  house_owner_id uuid not null,
  state text not null check (state in ('automacao', 'pendente', 'humano')),
  handler_name text check (handler_name is null or char_length(handler_name) <= 60),
  reason text check (reason is null or char_length(reason) <= 200),
  since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversation_handoff enable row level security;
revoke all on table public.conversation_handoff from public, anon, authenticated;
-- Sem política de leitura direta: o app lê pela função conversation_handoff_state (que confere quem pode ver).

-- 3) Registro dos eventos (alimenta o relatório da casa; só serviço e funções internas escrevem).
create table if not exists public.handoff_events (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  house_owner_id uuid not null,
  action text not null check (action in ('passada_para_casa', 'assumida', 'devolvida')),
  created_at timestamptz not null default now()
);
create index if not exists handoff_events_house_idx on public.handoff_events (house_owner_id, created_at desc);
create index if not exists handoff_events_conv_idx on public.handoff_events (conversation_id, action, created_at desc);
alter table public.handoff_events enable row level security;
revoke all on table public.handoff_events from public, anon, authenticated;
