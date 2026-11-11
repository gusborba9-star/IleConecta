-- PASSO 32: 0073 — agenda para qualquer serviço e coluna 'listed' (serviço privado)
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 1) Agenda para qualquer tipo de serviço
alter table public.services drop constraint if exists services_bookable_kind_chk;

-- 2) Serviço privado
alter table public.services add column if not exists listed boolean not null default true;
drop policy if exists services_read on public.services;
create policy services_read on public.services for select
  using ((active and listed) or public.is_house_owner(house_id));
