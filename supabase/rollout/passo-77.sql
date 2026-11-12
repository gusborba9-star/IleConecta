-- PASSO 77: 0088_cobranca_motor — parte 2 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create unique index if not exists platform_charges_provider_ref on public.platform_charges (provider, provider_ref) where provider_ref is not null;

create unique index if not exists platform_charges_one_per_period on public.platform_charges (house_id, kind, item_key, period_start) where period_start is not null and status <> 'cancelada';

create index if not exists platform_charges_house on public.platform_charges (house_id, due_date desc);

create index if not exists platform_charges_open on public.platform_charges (status, due_date) where status in ('aberta','vencida','em_processamento');

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
