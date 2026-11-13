-- PASSO 118: 0094_cobranca_automatica_cartao — parte 4 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- tentativas de cobrança automática (uma linha por fatura e número da tentativa)
create table if not exists public.platform_auto_attempts (
id bigint generated always as identity primary key,
charge_id uuid not null references public.platform_charges(id) on delete restrict,
attempt int not null check (attempt between 1 and 3),
outcome text not null check (outcome in ('iniciada', 'aprovada', 'recusada', 'exige_acao', 'processando')),
error_code text check (error_code is null or char_length(error_code) <= 80),
ref text check (ref is null or char_length(ref) <= 200),
last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique (charge_id, attempt)
);

alter table public.platform_auto_attempts enable row level security;

-- a administração só lê (nunca vê a referência do cartão: a tabela do cartão nem tem política de leitura)
drop policy if exists paa_read on public.platform_auto_attempts;

create policy paa_read on public.platform_auto_attempts for select to authenticated using (public.is_admin());
