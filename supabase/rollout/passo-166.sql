-- PASSO 166: 0100_reajuste_tabela_comercial — parte 2 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create unique index if not exists platform_price_changes_one_open on public.platform_price_changes (plan) where status = 'anunciado';

alter table public.platform_price_changes enable row level security;

drop policy if exists ppc_read on public.platform_price_changes;

create policy ppc_read on public.platform_price_changes for select to authenticated using (public.is_admin());
