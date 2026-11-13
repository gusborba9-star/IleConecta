-- PASSO 116: 0094_cobranca_automatica_cartao — parte 2 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) cartão guardado por casa (só o servidor lê; a casa vê marca e final pela função my_card_status) ============
create table if not exists public.house_card_on_file (
house_id uuid primary key references public.houses(id) on delete cascade,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
customer_ref text not null check (char_length(customer_ref) between 1 and 200),
method_ref text check (method_ref is null or char_length(method_ref) between 1 and 200),
brand text check (brand is null or char_length(brand) <= 30),
last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
exp_month int check (exp_month is null or exp_month between 1 and 12),
exp_year int check (exp_year is null or exp_year between 2000 and 2200),
auto_enabled boolean not null default false,
saved_on date,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
check (method_ref is not null or auto_enabled = false)
);

alter table public.house_card_on_file enable row level security;
