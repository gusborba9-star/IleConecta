-- PASSO 172: 0100_reajuste_tabela_comercial — parte 8 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) na data de vigência a tabela de preços recebe o valor novo ============
create or replace function public.platform_price_apply_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'America/Sao_Paulo')::date; c record; n integer := 0;
begin
for c in select * from public.platform_price_changes where status = 'anunciado' and effective_on <= d order by effective_on for update loop
perform set_config('app.price_apply', 'on', true);
update public.platform_settings set value = jsonb_set(value, array['plans', c.plan, 'monthly'], to_jsonb(round(c.new_cents / 100.0, 2))), updated_at = now() where key = 'pricing';
perform set_config('app.price_apply', 'off', true);
update public.platform_price_changes set status = 'aplicado', applied_at = p_now where id = c.id;
insert into public.platform_billing_events (provider, event_id, kind, outcome, reason) values ('sistema', gen_random_uuid()::text, 'preco_aplicado', 'processado', c.plan || ':' || c.new_cents);
n := n + 1;
end loop;
return n;
end $$;
