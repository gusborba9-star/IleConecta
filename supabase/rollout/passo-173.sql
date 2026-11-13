-- PASSO 173: 0100_reajuste_tabela_comercial — parte 9 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) aumento direto na tabela é recusado com a cobrança ligada (redução e demais campos seguem livres) ============
create or replace function public.platform_pricing_increase_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text; o numeric; n numeric;
begin
if new.key <> 'pricing' or coalesce(current_setting('app.price_apply', true), '') = 'on' then return new; end if;
if coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) is not true then return new; end if;
for p in select jsonb_object_keys(coalesce(new.value -> 'plans', '{}'::jsonb)) loop
o := case when (old.value -> 'plans' -> p ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then (old.value -> 'plans' -> p ->> 'monthly')::numeric end;
n := case when (new.value -> 'plans' -> p ->> 'monthly') ~ '^[0-9]+(\.[0-9]+)?$' then (new.value -> 'plans' -> p ->> 'monthly')::numeric end;
if o is not null and n is not null and n > o then raise exception 'Aumento de mensalidade só por reajuste anunciado, com 30 dias de antecedência.'; end if;
end loop;
return new;
end $$;

drop trigger if exists trg_platform_pricing_increase_guard on public.platform_settings;

create trigger trg_platform_pricing_increase_guard before update on public.platform_settings
for each row execute function public.platform_pricing_increase_guard();
