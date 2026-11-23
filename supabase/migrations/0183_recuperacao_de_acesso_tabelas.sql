-- 0183 — Recuperação de acesso e e-mails vinculados (decisão do proprietário, 23/11/2026; Blueprint §18, "Troca de e-mail e recuperação de acesso").
-- Passo 1 de 3: só as tabelas. Nada é lido ou gravado pelo app ainda. Pode rodar de novo sem problema.
-- Segurança: tudo com RLS ligado e sem acesso para anon/authenticated; só funções do servidor (service_role ou security definer) tocam nestas tabelas.

-- E-mails já vinculados a uma conta (atual e anteriores), normalizados. Sem chave estrangeira de propósito:
-- precisa sobreviver à exclusão da conta pelo prazo de retenção (mesma finalidade da identidade da conta excluída).
create table if not exists public.account_linked_emails (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text not null,
  email_key text not null,
  source text not null check (source in ('cadastro', 'troca_suporte')),
  request_id uuid,
  linked_at timestamptz not null default now(),
  retain_until timestamptz not null default now() + interval '5 years'
);
create unique index if not exists account_linked_emails_user_key on public.account_linked_emails (user_id, email_key);
create index if not exists account_linked_emails_key on public.account_linked_emails (email_key);
create index if not exists account_linked_emails_purge on public.account_linked_emails (retain_until);
alter table public.account_linked_emails enable row level security;
revoke all on table public.account_linked_emails from public, anon, authenticated;

-- Palavra de segurança: guardada só como código irreversível (bcrypt). Ninguém consegue ler; só se confere.
create table if not exists public.account_security_words (
  user_id uuid primary key references auth.users (id) on delete cascade,
  word_hash text not null,
  set_at timestamptz not null default now()
);
alter table public.account_security_words enable row level security;
revoke all on table public.account_security_words from public, anon, authenticated;

-- Pedidos de recuperação. Nunca guarda a palavra de segurança digitada (só se conferiu ou não).
create table if not exists public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ip inet,
  contact_email text not null,
  contact_email_key text not null,
  claimed jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  round smallint not null default 1 check (round in (1, 2)),
  parent_id uuid references public.account_recovery_requests (id) on delete set null,
  candidate_user_id uuid,
  candidates jsonb not null default '[]'::jsonb,
  word_checked boolean,
  evaluation jsonb,
  recommendation text check (recommendation in ('aprovar', 'recusar', 'segunda_rodada', 'insuficiente')),
  lane text not null default 'normal' check (lane in ('normal', 'sem_conta')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'segunda_rodada', 'confirmacao_enviada', 'concluido', 'expirado')),
  decided_by uuid,
  decided_at timestamptz,
  decision_account uuid,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  notify_at timestamptz not null default now() + interval '24 hours',
  apply_at timestamptz,
  decision_mail_sent_at timestamptz,
  confirm_mail_sent_at timestamptz,
  owner_notice_sent_at timestamptz,
  purge_after timestamptz not null default now() + interval '24 months'
);
create index if not exists account_recovery_status_idx on public.account_recovery_requests (status, created_at desc);
create index if not exists account_recovery_mail_idx on public.account_recovery_requests (contact_email_key, created_at desc);
create index if not exists account_recovery_cand_idx on public.account_recovery_requests (candidate_user_id, created_at desc);
alter table public.account_recovery_requests enable row level security;
revoke all on table public.account_recovery_requests from public, anon, authenticated;

-- Limite de pedidos por IP e por e-mail (janela de 1 hora). Só o servidor usa.
create table if not exists public.recovery_throttle (
  bucket text not null,
  window_start timestamptz not null,
  n integer not null default 1,
  primary key (bucket, window_start)
);
alter table public.recovery_throttle enable row level security;
revoke all on table public.recovery_throttle from public, anon, authenticated;
