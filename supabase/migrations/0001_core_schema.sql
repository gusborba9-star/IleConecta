-- Ile Conecta - Schema inicial (RASCUNHO PARA REVISAO - ainda nao aplicado)
-- Regras de negocio:
--  * 2 tipos de conta: casa | cliente
--  * 3 planos de casa: base | intermediario | maximo (assistente virtual: nenhuma | limitada | completa)
--  * Comissao 17% SOMENTE em eventos (rituais). Buzios e trabalhos: 0%.
--  * Dinheiro sempre em centavos inteiros. Casa = round_half_up(bruto*83/100); plataforma = bruto - casa.
--  * Repasse so apos fim do evento + 72h (America/Sao_Paulo) e conferencia de reembolsos/contestacoes.
--  * Tabelas financeiras (payments, ledger_entries, payouts) so sao escritas pelo backend (service role).

create extension if not exists pgcrypto;

-- ============ ENUMS ============
create type account_type    as enum ('casa', 'cliente');
create type house_plan      as enum ('base', 'intermediario', 'maximo');
create type post_kind       as enum ('geral', 'trabalho', 'ritual', 'buzios', 'story');
create type service_kind    as enum ('buzios', 'trabalho');
create type event_mode      as enum ('presencial', 'distancia', 'hibrido');
create type event_status    as enum ('rascunho', 'publicado', 'encerrado', 'cancelado');
create type reservation_status as enum ('aguardando_pagamento', 'confirmada', 'expirada', 'cancelada', 'reembolso_pendente', 'reembolsada');
create type payment_status  as enum ('pendente', 'confirmado', 'falhou', 'estornado_parcial', 'estornado', 'contestado');
create type payout_status   as enum ('bloqueado', 'elegivel', 'processando', 'pago', 'falhou');
create type boost_kind      as enum ('impulsionamento', 'destaque_feed');
create type boost_scope     as enum ('local', 'estado', 'pais');

-- ============ FUNCOES AUXILIARES ============
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Divisao 17/83 em centavos (FIN-D03-05 / D-017). Versao da regra: 'fin-v1'.
create or replace function public.split_gross_cents(gross_cents bigint)
returns table (house_cents bigint, platform_cents bigint)
language sql immutable as $$
  select ((gross_cents * 83 + 50) / 100) as house_cents,
         gross_cents - ((gross_cents * 83 + 50) / 100) as platform_cents;
$$;

-- ============ PERFIS E CASAS ============
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  account_type account_type not null,
  display_name text not null check (char_length(display_name) between 2 and 80),
  avatar_url   text,
  bio          text check (char_length(bio) <= 500),
  city text, state text, country text default 'BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.houses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 100),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  category    text,
  tags        text[] not null default '{}',
  cover_url   text,
  verified    boolean not null default false,   -- somente backend/admin altera
  plan        house_plan not null default 'base', -- somente backend altera (apos cobranca)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_houses_updated before update on public.houses for each row execute function public.set_updated_at();
create index houses_tags_gin on public.houses using gin (tags);

create or replace function public.is_house_owner(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses where id = h and owner_id = auth.uid());
$$;

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  house_id    uuid not null references public.houses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, house_id)
);

-- ============ CONTEUDO ============
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  kind post_kind not null default 'geral',
  content text not null check (char_length(content) between 1 and 2000),
  image_url text,
  created_at timestamptz not null default now()
);
create index posts_house_created on public.posts (house_id, created_at desc);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- ============ SERVICOS (buzios/trabalhos: SEM comissao) ============
create table public.services (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  kind service_kind not null,
  title text not null,
  description text,
  price_cents bigint not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ EVENTOS / RITUAIS (comissao 17%) ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null,
  description text,
  cover_url text,
  price_cents bigint not null check (price_cents > 0),
  seats_total int not null check (seats_total > 0),
  mode event_mode not null default 'distancia',
  starts_at timestamptz not null,
  ends_at timestamptz,                -- encerramento EFETIVO (base dos 72h)
  status event_status not null default 'rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_events_updated before update on public.events for each row execute function public.set_updated_at();
create index events_house on public.events (house_id, starts_at);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status reservation_status not null default 'aguardando_pagamento',
  expires_at timestamptz not null default (now() + interval '30 minutes'), -- vaga bloqueada ate expirar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_reservations_updated before update on public.reservations for each row execute function public.set_updated_at();
-- Uma reserva ativa por pessoa/evento (anti-duplicidade):
create unique index reservations_one_active on public.reservations (event_id, user_id)
  where status in ('aguardando_pagamento', 'confirmada');
-- Controle de vagas sem overselling: criar reservas SOMENTE via funcao/Edge Function no servidor (a definir em P-BOOK-01).

-- ============ FINANCEIRO (somente service role escreve) ============
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  provider text not null default 'asaas',
  provider_ref text unique,                       -- id da cobranca no provedor (idempotencia)
  gross_cents bigint not null check (gross_cents > 0),
  status payment_status not null default 'pendente',
  fee_rule_version text not null default 'fin-v1',
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ledger append-only: correcoes sao novos lancamentos compensatorios.
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  house_id uuid not null references public.houses(id) on delete restrict,
  entry_type text not null check (entry_type in ('bruto','casa','plataforma','reserva_interna','taxa_provedor','estorno','ajuste','repasse')),
  amount_cents bigint not null,                   -- pode ser negativo (estorno/ajuste)
  fee_rule_version text not null default 'fin-v1',
  note text,
  created_at timestamptz not null default now()
);
create index ledger_house on public.ledger_entries (house_id, created_at);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  eligible_at timestamptz not null,               -- ends_at + 72h (America/Sao_Paulo); guardar tambem UTC
  status payout_status not null default 'bloqueado',
  provider_ref text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.webhook_events (               -- persiste antes de processar; deduplica por id externo
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

-- ============ MONETIZACAO: IMPULSIONAMENTO / DESTAQUE ============
create table public.boosts (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  kind boost_kind not null,
  scope boost_scope not null,
  days int not null check (days in (3, 7, 30)),
  price_cents bigint not null check (price_cents > 0),
  paid boolean not null default false,            -- so backend marca como pago
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index boosts_active on public.boosts (kind, scope, expires_at) where paid;

-- ============ ASSISTENTE VIRTUAL (por casa) ============
create table public.assistants (
  house_id uuid primary key references public.houses(id) on delete cascade,
  enabled boolean not null default false,
  display_name text not null default 'Assistente',
  instructions text,                               -- explicacoes, tom, regras
  business_hours jsonb not null default '{}'::jsonb,
  can_sell boolean not null default false,
  can_discount boolean not null default false,
  max_discount_percent int not null default 0 check (max_discount_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
create trigger trg_assistants_updated before update on public.assistants for each row execute function public.set_updated_at();
-- Recursos liberados dependem de houses.plan (base: sem assistente | intermediario: limitado | maximo: completo) - validar no backend.

-- ============ MENSAGENS E NOTIFICACOES ============
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conv on public.messages (conversation_id, created_at);

create or replace function public.is_conversation_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = auth.uid());
$$;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ RLS (negar por padrao) ============
alter table public.profiles             enable row level security;
alter table public.houses               enable row level security;
alter table public.follows              enable row level security;
alter table public.posts                enable row level security;
alter table public.post_likes           enable row level security;
alter table public.post_comments        enable row level security;
alter table public.stories              enable row level security;
alter table public.services             enable row level security;
alter table public.events               enable row level security;
alter table public.reservations         enable row level security;
alter table public.payments             enable row level security;
alter table public.ledger_entries       enable row level security;
alter table public.payouts              enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.boosts               enable row level security;
alter table public.assistants           enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.notifications        enable row level security;

-- profiles: leitura publica basica; cada um edita o proprio (account_type nao muda pelo cliente)
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- houses: leitura publica; dono cria/edita (verified e plan sao protegidos por trigger abaixo)
create policy houses_read   on public.houses for select using (true);
create policy houses_insert on public.houses for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'casa'));
create policy houses_update on public.houses for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.protect_house_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then new.verified := false; new.plan := 'base';
    else new.verified := old.verified; new.plan := old.plan; end if;
  end if;
  return new;
end $$;
create trigger trg_houses_protect before insert or update on public.houses for each row execute function public.protect_house_privileged_columns();

create policy follows_read   on public.follows for select to authenticated using (follower_id = auth.uid() or public.is_house_owner(house_id));
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

create policy posts_read   on public.posts for select using (true);
create policy posts_write  on public.posts for insert to authenticated with check (public.is_house_owner(house_id));
create policy posts_update on public.posts for update to authenticated using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));
create policy posts_delete on public.posts for delete to authenticated using (public.is_house_owner(house_id));

create policy likes_read   on public.post_likes for select using (true);
create policy likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

create policy comments_read   on public.post_comments for select using (true);
create policy comments_insert on public.post_comments for insert to authenticated with check (user_id = auth.uid());
create policy comments_delete on public.post_comments for delete to authenticated using (user_id = auth.uid());

create policy stories_read  on public.stories for select using (expires_at > now() or public.is_house_owner(house_id));
create policy stories_write on public.stories for insert to authenticated with check (public.is_house_owner(house_id));
create policy stories_delete on public.stories for delete to authenticated using (public.is_house_owner(house_id));

create policy services_read  on public.services for select using (active or public.is_house_owner(house_id));
create policy services_write on public.services for all to authenticated using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));

create policy events_read  on public.events for select using (status in ('publicado','encerrado') or public.is_house_owner(house_id));
create policy events_write on public.events for all to authenticated using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));

-- reservations: leitura pelo cliente e pela casa dona do evento. SEM insert/update pelo cliente (somente backend).
create policy reservations_read on public.reservations for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and public.is_house_owner(e.house_id)));

-- financeiro: cliente ve o proprio pagamento; casa ve seu ledger/repasses; escrita so service role (sem policy)
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and r.user_id = auth.uid()));
create policy ledger_read on public.ledger_entries for select to authenticated using (public.is_house_owner(house_id));
create policy payouts_read on public.payouts for select to authenticated using (public.is_house_owner(house_id));
-- webhook_events: nenhuma policy (apenas service role)

create policy boosts_read   on public.boosts for select using (paid or public.is_house_owner(house_id));
create policy boosts_insert on public.boosts for insert to authenticated with check (public.is_house_owner(house_id) and paid = false);

create policy assistants_owner on public.assistants for all to authenticated using (public.is_house_owner(house_id)) with check (public.is_house_owner(house_id));

create policy conv_members_read on public.conversation_members for select to authenticated using (user_id = auth.uid() or public.is_conversation_member(conversation_id));
create policy conv_read  on public.conversations for select to authenticated using (public.is_conversation_member(id));
create policy msgs_read  on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
create policy msgs_write on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

create policy notifs_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifs_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
