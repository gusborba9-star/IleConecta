-- PASSO 80: 0088_cobranca_motor — parte 5 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) quem lê o quê (ninguém escreve direto: só as funções abaixo) ============
alter table public.house_billing_plan enable row level security;

alter table public.house_billing_state enable row level security;

alter table public.platform_charges enable row level security;

alter table public.platform_billing_events enable row level security;

alter table public.platform_ledger_entries enable row level security;

alter table public.platform_billing_notices enable row level security;

drop policy if exists hbp_read on public.house_billing_plan;

create policy hbp_read on public.house_billing_plan for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists hbs_read on public.house_billing_state;

create policy hbs_read on public.house_billing_state for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists pc_read on public.platform_charges;

create policy pc_read on public.platform_charges for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

drop policy if exists pbe_read on public.platform_billing_events;

create policy pbe_read on public.platform_billing_events for select to authenticated using (public.is_admin());

drop policy if exists ple_read on public.platform_ledger_entries;

create policy ple_read on public.platform_ledger_entries for select to authenticated using (public.is_admin());

drop policy if exists pbn_read on public.platform_billing_notices;

create policy pbn_read on public.platform_billing_notices for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));
