-- PASSO 141: 0096_autorizacao_cobranca_automatica — parte 2 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create index if not exists house_auto_authorizations_house on public.house_auto_authorizations (house_id, created_at desc);

alter table public.house_auto_authorizations enable row level security;

drop policy if exists haa_read on public.house_auto_authorizations;

create policy haa_read on public.house_auto_authorizations for select to authenticated using (public.is_admin() or public.is_house_owner(house_id));

-- ============ 3) ninguém altera nem apaga ============
create or replace function public.house_auto_authorizations_guard() returns trigger
language plpgsql set search_path = public as $$
begin
raise exception 'A autorização de cobrança automática não pode ser alterada nem apagada.';
end $$;

drop trigger if exists trg_house_auto_authorizations_guard on public.house_auto_authorizations;

create trigger trg_house_auto_authorizations_guard before update or delete on public.house_auto_authorizations
for each row execute function public.house_auto_authorizations_guard();
