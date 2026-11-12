-- PASSO 76: 0088_cobranca_motor — parte 1 de 16
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: motor da cobrança da plataforma às casas (Blueprint §18.5). Faturas, eventos do provedor, livro-razão próprio, avisos, tolerância em dias úteis
-- e suspensão parcial. Tudo desligado por padrão (billing_config.enabled = false): com a cobrança desligada o motor não emite, não avisa e não suspende.
-- Só entram no calendário as casas matriculadas pelo administrador. Não depende de provedor: quem confirma o pagamento é a função confirm, chamada pelo backend
-- depois que o provedor confirma. Registros financeiros não têm chave estrangeira para a casa: sobrevivem à exclusão da conta (retenção).

-- ============ 0) configuração: prazo do bloqueio total (opcional; vale 30 dias quando ausente) ============
create or replace function public.billing_config_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; x jsonb; kinds text[] := array['plan','extra_seat','credit_pack','highlight','boost']; meths text[] := array['card','card_recurring','pix'];
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a where a <> 'total_block_days') is distinct from array['enabled','methods','notice_days','provider','tolerance_business_days'] then return false; end if;
if m ? 'total_block_days' and (coalesce(jsonb_typeof(m -> 'total_block_days'), '') <> 'number' or (m ->> 'total_block_days') !~ '^[0-9]{1,2}$' or (m ->> 'total_block_days')::int not between 7 and 90) then return false; end if;
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

create or replace function public.billing_total_days() returns int
language sql stable security definer set search_path = public as $$
select coalesce(nullif((public.platform_billing_config() ->> 'total_block_days'), '')::int, 30);
$$;
