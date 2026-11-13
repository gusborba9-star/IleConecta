-- PASSO 70: 0087_cobranca_base — parte 1 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
