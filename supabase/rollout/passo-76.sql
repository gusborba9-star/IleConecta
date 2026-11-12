-- PASSO 76: 0088_cobranca_motor — parte 1 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: motor da cobrança da plataforma às casas (Blueprint §18.5). Faturas, eventos do provedor, livro-razão próprio, avisos, tolerância em dias úteis
-- e suspensão parcial. Tudo desligado por padrão (billing_config.enabled = false): com a cobrança desligada o motor não emite, não avisa e não suspende.
-- Só entram no calendário as casas matriculadas pelo administrador. Não depende de provedor: quem confirma o pagamento é a função confirm, chamada pelo backend
-- depois que o provedor confirma. Registros financeiros não têm chave estrangeira para a casa: sobrevivem à exclusão da conta (retenção).

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
updated_at timestamptz not null default now()
);

-- ============ 2) faturas ============
create table if not exists public.platform_charges (
id uuid primary key default gen_random_uuid(),
house_id uuid not null,
kind text not null check (kind in ('plan','extra_seat','credit_pack','highlight','boost')),
item_key text not null check (char_length(item_key) between 1 and 60),
description text check (description is null or char_length(description) <= 200),
amount_cents bigint not null check (amount_cents between 100 and 5000000),
period_start date,
due_date date not null,
status text not null default 'aberta' check (status in ('aberta','vencida','em_processamento','paga','cancelada','estornada')),
ref_id uuid,
provider text check (provider is null or provider ~ '^[a-z][a-z0-9_]{1,23}$'),
provider_ref text check (provider_ref is null or char_length(provider_ref) between 1 and 200),
provider_method text check (provider_method is null or provider_method in ('card','card_recurring','pix')),
checkout_url text check (checkout_url is null or checkout_url ~ '^https://'),
paid_at timestamptz,
paid_amount_cents bigint check (paid_amount_cents is null or paid_amount_cents > 0),
processor_fee_cents bigint check (processor_fee_cents is null or processor_fee_cents >= 0),
idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 120),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
check ((status = 'paga') = (paid_at is not null) or status in ('estornada','cancelada'))
);
