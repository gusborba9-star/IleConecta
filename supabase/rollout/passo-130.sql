-- PASSO 130: 0095_reembolso_creditos_7_dias — parte 2 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create unique index if not exists platform_credit_refunds_one_active on public.platform_credit_refunds (charge_id) where status in ('pendente', 'concluido');

alter table public.platform_credit_refunds enable row level security;

drop policy if exists pcr_read on public.platform_credit_refunds;

create policy pcr_read on public.platform_credit_refunds for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));
