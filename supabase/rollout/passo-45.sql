-- PASSO 45: 0078_chamados_e_casos — parte 2 de 7
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- provas enviadas pelas partes, sempre por escolha (consent_at obrigatório)
create table if not exists public.support_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('autor','envolvido')),
  bucket text not null default 'report-evidence' check (bucket = 'report-evidence'),
  path text not null check (char_length(path) between 5 and 300),
  note text check (note is null or char_length(note) <= 300),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (case_id, path)
);

alter table public.support_case_evidence enable row level security;

revoke all on public.support_case_evidence from anon, authenticated;

-- fatos reais da plataforma, congelados no momento (admin refaz quando quiser; as versões antigas ficam)
create table if not exists public.support_case_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  taken_by uuid references auth.users(id) on delete set null,
  taken_at timestamptz not null default now(),
  facts jsonb not null
);

alter table public.support_case_snapshots enable row level security;

revoke all on public.support_case_snapshots from anon, authenticated;

-- registro de ações do administrador: só entra, nunca muda nem sai
create table if not exists public.support_case_log (
  id bigserial primary key,
  case_id uuid,   -- sem chave estrangeira de propósito: o registro sobrevive à limpeza do chamado
  actor uuid,
  action text not null,
  reason text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.support_case_log enable row level security;

revoke all on public.support_case_log from anon, authenticated;

create or replace function public.support_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'O registro de suporte não pode ser alterado.';
end $$;

drop trigger if exists trg_support_log_immutable on public.support_case_log;

create trigger trg_support_log_immutable before update or delete on public.support_case_log
  for each row execute function public.support_log_immutable();
