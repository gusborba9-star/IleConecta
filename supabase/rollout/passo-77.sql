-- PASSO 77: 0088_cobranca_motor — parte 2 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 1) matrícula no calendário de cobrança e estado da casa ============
create table if not exists public.house_billing_plan (
house_id uuid primary key references public.houses(id) on delete cascade,
billing_day int not null check (billing_day between 1 and 28),
started_on date not null,
active boolean not null default true,
updated_at timestamptz not null default now()
);

create table if not exists public.house_billing_state (
house_id uuid primary key references public.houses(id) on delete cascade,
suspended boolean not null default false,
since timestamptz,
total boolean not null default false,
total_since timestamptz,
updated_at timestamptz not null default now()
);

alter table public.house_billing_state add column if not exists total boolean not null default false;

alter table public.house_billing_state add column if not exists total_since timestamptz;
