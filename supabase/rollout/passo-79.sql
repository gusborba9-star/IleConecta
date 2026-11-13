-- PASSO 79: 0088_cobranca_motor — parte 4 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) eventos do provedor, livro-razão próprio e avisos ============
create table if not exists public.platform_billing_events (
id bigint generated always as identity primary key,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
event_id text not null check (char_length(event_id) between 1 and 200),
kind text not null check (char_length(kind) between 1 and 60),
charge_id uuid,
outcome text not null check (outcome in ('recebido','processado','rejeitado')),
reason text check (reason is null or char_length(reason) <= 300),
created_at timestamptz not null default now(),
unique (provider, event_id)
);

create table if not exists public.platform_ledger_entries (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
entry_type text not null check (entry_type in ('receita','taxa_provedor','estorno')),
amount_cents bigint not null check (amount_cents <> 0),
created_at timestamptz not null default now()
);

create index if not exists platform_ledger_charge on public.platform_ledger_entries (charge_id);

create table if not exists public.platform_billing_notices (
id bigint generated always as identity primary key,
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
stage text not null check (stage in ('fatura_disponivel','vespera','dia_vencimento','tolerancia','suspensao','total_em_breve')),
created_at timestamptz not null default now(),
unique (charge_id, stage)
);
