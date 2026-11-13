-- PASSO 117: 0094_cobranca_automatica_cartao — parte 3 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- páginas de cadastro de cartão abertas: o retorno só vale para a casa que abriu (evita aplicar a sessão de outra casa)
create table if not exists public.house_card_setups (
ref text primary key check (char_length(ref) between 1 and 200),
house_id uuid not null references public.houses(id) on delete cascade,
provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,23}$'),
done boolean not null default false,
created_at timestamptz not null default now()
);

alter table public.house_card_setups enable row level security;
