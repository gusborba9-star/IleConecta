-- PASSO 150: 0098_reembolso_plano_7_dias — parte 4 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) reembolsos de plano ============
create table if not exists public.platform_plan_refunds (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
amount_cents bigint not null check (amount_cents > 0),
status text not null default 'pendente' check (status in ('pendente', 'concluido', 'falhou')),
provider text,
provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
error text check (error is null or char_length(error) <= 300),
requested_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
done_at timestamptz
);

create unique index if not exists platform_plan_refunds_one_per_house on public.platform_plan_refunds (house_id) where status in ('pendente', 'concluido');

create unique index if not exists platform_plan_refunds_one_per_charge on public.platform_plan_refunds (charge_id) where status in ('pendente', 'concluido');
