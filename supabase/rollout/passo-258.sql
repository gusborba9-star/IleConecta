-- PASSO 258: 0123_desconto_pontualidade_pix — parte 1 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0123 — Desconto de pontualidade no Pix (decisão do proprietário, 15/11/2026): só na mensalidade do plano, só no Pix, até a véspera do vencimento.
-- A fatura guarda o valor cheio, o desconto e o prazo. A página de pagamento do Pix cobra o valor com desconto e a referência guarda o valor pedido;
-- a confirmação aceita somente o valor pedido naquela referência (cheio ou com desconto) e rejeita qualquer outro. Cartão sempre cobra o valor cheio.
-- Percentual, prazo e liga/desliga ficam no painel (billing_config.pix_discount). Sem o campo, o desconto está desligado.

-- ============ 1) Colunas
alter table public.platform_charges add column if not exists pix_discount_cents bigint not null default 0 check (pix_discount_cents >= 0);

alter table public.platform_charges add column if not exists pix_discount_until date;

alter table public.platform_charges drop constraint if exists platform_charges_pix_discount_lt_amount;

alter table public.platform_charges add constraint platform_charges_pix_discount_lt_amount check (pix_discount_cents < amount_cents);

alter table public.platform_charge_refs add column if not exists amount_cents bigint;

alter table public.platform_charge_refs drop constraint if exists platform_charge_refs_amount_pos;

alter table public.platform_charge_refs add constraint platform_charge_refs_amount_pos check (amount_cents is null or amount_cents > 0);

-- ============ 2) Configuração válida: aceita o campo opcional pix_discount {enabled, pct 1..20, ends_days_before 0..14}
create or replace function public.billing_config_ok(m jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; x jsonb; kinds text[] := array['plan','extra_seat','credit_pack','highlight','boost']; meths text[] := array['card','card_recurring','pix'];
begin
if coalesce(jsonb_typeof(m), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(m) a where a not in ('total_block_days', 'pix_discount')) is distinct from array['enabled','methods','notice_days','provider','tolerance_business_days'] then return false; end if;
if m ? 'total_block_days' and (coalesce(jsonb_typeof(m -> 'total_block_days'), '') <> 'number' or (m ->> 'total_block_days') !~ '^[0-9]{1,2}$' or (m ->> 'total_block_days')::int not between 7 and 90) then return false; end if;
if m ? 'pix_discount' then
v := m -> 'pix_discount';
if coalesce(jsonb_typeof(v), '') <> 'object' then return false; end if;
if (select array_agg(a order by a) from jsonb_object_keys(v) a) is distinct from array['enabled','ends_days_before','pct'] then return false; end if;
if coalesce(jsonb_typeof(v -> 'enabled'), '') <> 'boolean' then return false; end if;
if coalesce(jsonb_typeof(v -> 'pct'), '') <> 'number' or (v ->> 'pct') !~ '^[0-9]{1,2}$' or (v ->> 'pct')::int not between 1 and 20 then return false; end if;
if coalesce(jsonb_typeof(v -> 'ends_days_before'), '') <> 'number' or (v ->> 'ends_days_before') !~ '^[0-9]{1,2}$' or (v ->> 'ends_days_before')::int not between 0 and 14 then return false; end if;
end if;
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
