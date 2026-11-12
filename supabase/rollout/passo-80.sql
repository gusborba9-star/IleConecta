-- PASSO 80: 0088_cobranca_motor — parte 5 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) proteções: livro-razão e eventos imutáveis; fatura só muda pelo caminho certo ============
create or replace function public.platform_billing_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
raise exception 'Registro financeiro da plataforma não pode ser alterado nem apagado.';
end $$;

drop trigger if exists trg_platform_ledger_immutable on public.platform_ledger_entries;

create trigger trg_platform_ledger_immutable before update or delete on public.platform_ledger_entries
for each row execute function public.platform_billing_immutable();

drop trigger if exists trg_platform_events_immutable on public.platform_billing_events;

create trigger trg_platform_events_immutable before update or delete on public.platform_billing_events
for each row execute function public.platform_billing_immutable();
