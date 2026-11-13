-- PASSO 73: 0087_cobranca_base — parte 4 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) leitura pelo banco (se faltar ou estiver inválida, valem os valores iniciais) ============
create or replace function public.platform_billing_config() returns jsonb
language sql stable security definer set search_path = public as $$
select coalesce((select s.value from public.platform_settings s where s.key = 'billing_config' and public.billing_config_ok(s.value)), public.billing_config_default());
$$;

create or replace function public.platform_billing_prices() returns jsonb
language sql stable security definer set search_path = public as $$
select coalesce((select s.value from public.platform_settings s where s.key = 'billing_prices' and public.billing_prices_ok(s.value)), public.billing_prices_default());
$$;

-- ============ 4) dias úteis (tolerância e avisos contam em dias úteis; feriados nacionais ajustáveis pelo administrador) ============
create table if not exists public.billing_holidays (
day date primary key,
name text not null check (char_length(btrim(name)) between 2 and 80)
);

alter table public.billing_holidays enable row level security;

drop policy if exists billing_holidays_read on public.billing_holidays;

create policy billing_holidays_read on public.billing_holidays for select to authenticated using (public.is_admin());

insert into public.billing_holidays (day, name) values
('2026-01-01','Confraternização Universal'),('2026-04-03','Sexta-feira Santa'),('2026-04-21','Tiradentes'),('2026-05-01','Dia do Trabalho'),
('2026-09-07','Independência'),('2026-10-12','Nossa Senhora Aparecida'),('2026-11-02','Finados'),('2026-11-15','Proclamação da República'),
('2026-11-20','Consciência Negra'),('2026-12-25','Natal'),
('2027-01-01','Confraternização Universal'),('2027-03-26','Sexta-feira Santa'),('2027-04-21','Tiradentes'),('2027-05-01','Dia do Trabalho'),
('2027-09-07','Independência'),('2027-10-12','Nossa Senhora Aparecida'),('2027-11-02','Finados'),('2027-11-15','Proclamação da República'),
('2027-11-20','Consciência Negra'),('2027-12-25','Natal'),
('2028-01-01','Confraternização Universal'),('2028-04-14','Sexta-feira Santa'),('2028-04-21','Tiradentes'),('2028-05-01','Dia do Trabalho'),
('2028-09-07','Independência'),('2028-10-12','Nossa Senhora Aparecida'),('2028-11-02','Finados'),('2028-11-15','Proclamação da República'),
('2028-11-20','Consciência Negra'),('2028-12-25','Natal')
on conflict (day) do nothing;

create or replace function public.billing_is_business_day(d date) returns boolean
language sql stable security definer set search_path = public as $$
select d is not null and extract(isodow from d) < 6 and not exists (select 1 from public.billing_holidays h where h.day = d);
$$;
