-- PASSO 71: 0087_cobranca_base — parte 2 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
