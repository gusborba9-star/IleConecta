-- PASSO 107: 0091_creditos_de_ia — parte 9 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) tela da casa: franquia, saldo e preços ============
create or replace function public.my_ai_credit_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; pl text; lim int; used int; v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
select id, plan::text into h, pl from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false); end if;
lim := public.assistant_monthly_limit(pl);
select count(*) into used from public.assistant_usage where house_id = h and created_at >= v_month;
return jsonb_build_object('has_house', true, 'limit', lim, 'used_month', used, 'balance', public.ai_credit_balance(h),
'packs', coalesce((select jsonb_agg(jsonb_build_object('size', p.size, 'remaining', p.remaining, 'expires_at', p.expires_at) order by p.purchased_at, p.id) from public.ai_credit_packs p where p.house_id = h and p.remaining > 0 and p.expires_at > now()), '[]'::jsonb),
'prices', public.platform_billing_prices() -> 'credit_pack', 'for_sale', coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false) and lim > 0);
end $$;

-- ============ 6) compra: valida, usa o preço do painel e reaproveita a fatura aberta (clique repetido não cria outra) ============
create or replace function public.platform_credit_purchase(p_house uuid, p_pack text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_price bigint; v_id uuid; v_size int; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
if p_pack not in ('p80', 'p200', 'p500') then raise exception 'Pacote inválido.'; end if;
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
perform pg_advisory_xact_lock(hashtextextended('credit_purchase:' || p_house::text, 0));
select plan::text into v_plan from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
if public.assistant_monthly_limit(v_plan) <= 0 then raise exception 'O plano da casa não inclui a assistente.'; end if;
if public.house_billing_level(p_house) <> 'ok' then raise exception 'Regularize a fatura em atraso para comprar créditos.'; end if;
v_price := (public.platform_billing_prices() -> 'credit_pack' ->> p_pack)::bigint;
v_size := (regexp_replace(p_pack, '^p', ''))::int;
select id into v_id from public.platform_charges where house_id = p_house and kind = 'credit_pack' and item_key = p_pack and amount_cents = v_price and status in ('aberta', 'vencida') and created_at > now() - interval '1 day' order by created_at desc limit 1;
if v_id is not null then return v_id; end if;
return public.platform_charge_issue(p_house, 'credit_pack', p_pack, v_price, v_today, null, 'Pacote de ' || v_size || ' respostas da assistente', 'credit:' || p_house || ':' || gen_random_uuid());
end $$;
