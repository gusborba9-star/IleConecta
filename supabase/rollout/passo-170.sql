-- PASSO 170: 0100_reajuste_tabela_comercial — parte 6 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) administrador anuncia, avisa as casas e pode cancelar antes da vigência ============
create or replace function public.admin_price_announce(p_plan text, p_new_monthly numeric, p_effective_on date, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_old bigint; v_new bigint; v_id uuid; v_n integer; v_name text; v_text text;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_plan not in ('base', 'intermediario', 'maximo') then raise exception 'Plano inválido.'; end if;
if p_effective_on is null or p_effective_on < v_today + 30 then raise exception 'A data de vigência precisa ter pelo menos 30 dias de antecedência.'; end if;
if p_effective_on > v_today + 400 then raise exception 'A data de vigência está muito distante.'; end if;
if p_new_monthly is null or p_new_monthly <= 0 or p_new_monthly > 50000 then raise exception 'Valor inválido.'; end if;
v_new := round(p_new_monthly * 100)::bigint;
v_old := public.platform_plan_monthly_cents(p_plan, v_today);
if v_old is null then raise exception 'Este plano não tem mensalidade na tabela.'; end if;
if v_new <= v_old then raise exception 'Redução de preço vale na hora e é feita direto na tabela de preços; o reajuste anunciado é só para aumento.'; end if;
select value -> 'plans' -> p_plan ->> 'name' into v_name from public.platform_settings where key = 'pricing';
insert into public.platform_price_changes (plan, old_cents, new_cents, announced_on, effective_on, reason, announced_by)
values (p_plan, v_old, v_new, v_today, p_effective_on, left(btrim(p_reason), 300), auth.uid()) returning id into v_id;
v_text := 'Atualização da tabela comercial: a partir de ' || to_char(p_effective_on, 'DD/MM/YYYY') || ', o plano ' || coalesce(v_name, p_plan) || ' passa de R$ ' || replace(to_char(v_old / 100.0, 'FM9999990.00'), '.', ',') || ' para R$ ' || replace(to_char(v_new / 100.0, 'FM9999990.00'), '.', ',') || ' por mês. O novo valor vale para as renovações com vencimento a partir dessa data. Em caso de dúvida, fale com o suporte.';
insert into public.notifications (user_id, text, href)
select distinct h.owner_id, v_text, '/planos' from public.houses h join public.house_billing_plan b on b.house_id = h.id and b.active
where h.plan::text = p_plan and h.owner_id is not null;
get diagnostics v_n = row_count;
update public.platform_price_changes set notified = v_n where id = v_id;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'price_announce', null, jsonb_build_object('change', v_id, 'plan', p_plan, 'old_cents', v_old, 'new_cents', v_new, 'effective_on', p_effective_on, 'notified', v_n));
return jsonb_build_object('id', v_id, 'notified', v_n, 'old_cents', v_old, 'new_cents', v_new);
end $$;
