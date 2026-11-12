-- PASSO 72: 0087_cobranca_base — parte 3 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
