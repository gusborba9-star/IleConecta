-- Fase 4: base da cobrança da plataforma às casas (Blueprint §18.5). Configuração e preços editáveis pelo administrador (com auditoria),
-- calendário de dias úteis (a tolerância conta dias úteis). Nada aqui cobra ninguém: a cobrança real só liga por decisão expressa do proprietário.
-- Os valores moram em platform_settings (mesma auditoria das outras configurações). Nenhum segredo fica aqui: chaves do provedor só nos segredos do Supabase.

-- ============ 1) configuração e preços: valores iniciais e validação ============
create or replace function public.billing_config_default() returns jsonb
language sql immutable set search_path = public as $$
select '{"enabled":false,"notice_days":3,"tolerance_business_days":3,"provider":{"plan":"stripe","extra_seat":"stripe","credit_pack":"stripe","highlight":"stripe","boost":"stripe"},"methods":{"plan":["card","card_recurring","pix"],"extra_seat":["card","card_recurring","pix"],"credit_pack":["card","pix"],"highlight":["card","pix"],"boost":["card","pix"]}}'::jsonb;
$$;

create or replace function public.billing_config_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; x jsonb; kinds text[] := array['plan','extra_seat','credit_pack','highlight','boost']; meths text[] := array['card','card_recurring','pix'];
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a) is distinct from array['enabled','methods','notice_days','provider','tolerance_business_days'] then return false; end if;
if coalesce(jsonb_typeof(m -> 'enabled'), '') <> 'boolean' then return false; end if;
foreach k in array array['notice_days','tolerance_business_days'] loop
if coalesce(jsonb_typeof(m -> k), '') <> 'number' or (m ->> k) !~ '^[0-9]{1,2}$' then return false; end if;
end loop;
if (m ->> 'notice_days')::int not between 1 and 15 then return false; end if;
if (m ->> 'tolerance_business_days')::int not between 0 and 10 then return false; end if;
foreach k in array array['provider','methods'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from (select array_agg(a order by a) from unnest(kinds) a) then return false; end if;
end loop;
foreach k in array kinds loop
if coalesce(jsonb_typeof(m -> 'provider' -> k), '') <> 'string' or (m -> 'provider' ->> k) !~ '^[a-z][a-z0-9_]{1,23}$' then return false; end if;
v := m -> 'methods' -> k;
if coalesce(jsonb_typeof(v), '') <> 'array' or jsonb_array_length(v) not between 1 and 3 then return false; end if;
for x in select jsonb_array_elements(v) loop
if coalesce(jsonb_typeof(x), '') <> 'string' or not ((x #>> '{}') = any (meths)) then return false; end if;
end loop;
if (select count(distinct e) from jsonb_array_elements_text(v) e) <> jsonb_array_length(v) then return false; end if;
end loop;
return true;
end $$;

create or replace function public.billing_prices_default() returns jsonb
language sql immutable set search_path = public as $$
select '{"extra_seat":{"base":2990,"intermediario":3990,"maximo":3990},"credit_pack":{"p80":1990,"p200":4990,"p500":8990},"highlight":null,"boost":null}'::jsonb;
$$;

create or replace function public.billing_prices_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; g text; v jsonb;
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a) is distinct from array['boost','credit_pack','extra_seat','highlight'] then return false; end if;
foreach k in array array['extra_seat','credit_pack'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from (case k when 'extra_seat' then array['base','intermediario','maximo'] else array['p200','p500','p80'] end) then return false; end if;
for g in select jsonb_object_keys(v) loop
if coalesce(jsonb_typeof(v -> g), '') <> 'number' or (v ->> g) !~ '^[0-9]{1,7}$' or (v ->> g)::bigint not between 100 and 1000000 then return false; end if;
end loop;
end loop;
foreach k in array array['highlight','boost'] loop
v := m -> k;
if coalesce(jsonb_typeof(v), 'null') = 'null' then continue; end if;
if jsonb_typeof(v) <> 'number' or (m ->> k) !~ '^[0-9]{1,7}$' or (m ->> k)::bigint not between 100 and 1000000 then return false; end if;
end loop;
return true;
end $$;

-- ============ 2) viram configurações do painel (mesma auditoria) ============
alter table public.platform_settings drop constraint if exists platform_settings_key_check;

alter table public.platform_settings add constraint platform_settings_key_check
check (key = any (array['features','pricing','scopes','payment_limits','referral','plan_matrix','billing_config','billing_prices']));

insert into public.platform_settings (key, value) values ('billing_config', public.billing_config_default()) on conflict (key) do nothing;

insert into public.platform_settings (key, value) values ('billing_prices', public.billing_prices_default()) on conflict (key) do nothing;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare old_val jsonb;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_key not in ('features', 'pricing', 'scopes', 'payment_limits', 'referral', 'plan_matrix', 'billing_config', 'billing_prices') then raise exception 'invalid_key'; end if;
if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
raise exception 'invalid_value';
end if;
if p_key = 'payment_limits' then
if jsonb_typeof(p_value -> 'max_cents') <> 'number'
or (p_value ->> 'max_cents') !~ '^[0-9]+$'
or (p_value ->> 'max_cents')::bigint not between 10000 and 10000000 then
raise exception 'O teto por pagamento deve ficar entre R$ 100 e R$ 100.000.';
end if;
end if;
if p_key = 'referral' then
if (p_value ->> 'reward_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'reward_days')::int not between 1 and 90
or (p_value ->> 'referred_days') !~ '^[0-9]{1,2}$' or (p_value ->> 'referred_days')::int not between 0 and 90
or (p_value ->> 'monthly_cap') !~ '^[0-9]{1,3}$' or (p_value ->> 'monthly_cap')::int not between 1 and 100 then
raise exception 'Dias de prêmio entre 1 e 90, dias da casa indicada entre 0 e 90 e limite mensal entre 1 e 100.';
end if;
end if;
if p_key = 'plan_matrix' and not public.plan_matrix_ok(p_value) then
raise exception 'Matriz de planos inválida: confira os limites (números inteiros dentro da faixa) e os textos.';
end if;
if p_key = 'billing_config' and not public.billing_config_ok(p_value) then
raise exception 'Configuração de cobrança inválida: confira avisos (1 a 15 dias), tolerância (0 a 10 dias úteis), provedor e meios de cada cobrança.';
end if;
if p_key = 'billing_prices' and not public.billing_prices_ok(p_value) then
raise exception 'Preços de cobrança inválidos: valores em centavos entre R$ 1,00 e R$ 10.000,00 (destaque e impulsionamento podem ficar em branco).';
end if;
select value into old_val from public.platform_settings where key = p_key;
insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, auth.uid())
on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), p_key, old_val, p_value);
end $$;

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

-- n-ésimo dia útil depois de d (n = 0 devolve d mesmo que não seja útil; n > 0 conta só dias úteis, nunca o próprio d)
create or replace function public.billing_add_business_days(d date, n int) returns date
language plpgsql stable security definer set search_path = public as $$
declare cur date := d; left_n int := n;
begin
if d is null or n is null or n < 0 or n > 60 then raise exception 'Parâmetros inválidos para dias úteis.'; end if;
while left_n > 0 loop
cur := cur + 1;
if public.billing_is_business_day(cur) then left_n := left_n - 1; end if;
end loop;
return cur;
end $$;

-- feriado: o administrador inclui ou remove (motivo implícito no nome; fica no histórico)
create or replace function public.admin_set_billing_holiday(p_day date, p_name text, p_remove boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_day is null or p_day < date '2026-01-01' or p_day > date '2035-12-31' then raise exception 'Data fora do intervalo permitido.'; end if;
if p_remove then
delete from public.billing_holidays where day = p_day;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_holiday', jsonb_build_object('day', p_day), jsonb_build_object('removed', true));
return;
end if;
if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Informe o nome do feriado (2 a 80 caracteres).'; end if;
insert into public.billing_holidays (day, name) values (p_day, btrim(p_name)) on conflict (day) do update set name = excluded.name;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'billing_holiday', null, jsonb_build_object('day', p_day, 'name', btrim(p_name)));
end $$;

-- ============ 5) permissões ============
revoke all on function public.billing_config_default(), public.billing_config_ok(jsonb), public.billing_prices_default(), public.billing_prices_ok(jsonb), public.platform_billing_config(), public.platform_billing_prices(), public.billing_is_business_day(date), public.billing_add_business_days(date, int), public.admin_set_billing_holiday(date, text, boolean) from public, anon, authenticated;

grant execute on function public.platform_billing_config(), public.platform_billing_prices(), public.billing_is_business_day(date), public.billing_add_business_days(date, int) to service_role;

grant execute on function public.admin_set_billing_holiday(date, text, boolean) to authenticated;

revoke all on public.billing_holidays from anon, authenticated;

grant select on public.billing_holidays to authenticated;
