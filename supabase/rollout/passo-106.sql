-- PASSO 106: 0091_creditos_de_ia — parte 8 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- grava a resposta e debita o crédito na mesma transação, uma vez por resposta; a franquia mensal vem primeiro
create or replace function public.assistant_record_usage(p_house uuid, p_user uuid, p_model text, p_prompt int, p_completion int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_usage uuid; v_plan text; v_owner uuid; v_limit int; v_used int; v_pack public.ai_credit_packs; v_from boolean := false; v_left int; v_thr int;
v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
perform pg_advisory_xact_lock(hashtextextended('assistant_usage:' || p_house::text, 0));
select owner_id, plan::text into v_owner, v_plan from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
v_limit := public.assistant_monthly_limit(v_plan);
insert into public.assistant_usage (house_id, user_id, model, prompt_tokens, completion_tokens)
values (p_house, p_user, p_model, greatest(coalesce(p_prompt, 0), 0), greatest(coalesce(p_completion, 0), 0)) returning id into v_usage;
select count(*) into v_used from public.assistant_usage where house_id = p_house and created_at >= v_month;
if v_limit > 0 and v_used > v_limit then
select * into v_pack from public.ai_credit_packs where house_id = p_house and remaining > 0 and expires_at > now() order by purchased_at, id limit 1 for update;
if found then
update public.ai_credit_packs set remaining = remaining - 1 where id = v_pack.id;
insert into public.ai_credit_ledger (house_id, pack_id, usage_id) values (p_house, v_pack.id, v_usage);
v_from := true;
end if;
end if;
v_left := public.ai_credit_balance(p_house);
if v_owner is not null and v_limit > 0 then
v_thr := ceil(v_limit * 0.8)::int;
if v_thr < v_limit and v_used = v_thr then
insert into public.notifications (user_id, text, href) values (v_owner, 'A assistente já usou 80% das respostas do mês (' || v_used || ' de ' || v_limit || ').', '/planos');
elsif v_used = v_limit then
insert into public.notifications (user_id, text, href) values (v_owner, case when v_left > 0
then 'A franquia de respostas do mês acabou. A assistente continua com os seus créditos (saldo de ' || v_left || ' respostas).'
else 'A franquia de respostas do mês acabou. A assistente pausa até o próximo mês, ou compre um pacote de créditos para continuar.' end, '/planos');
elsif v_from and v_left = 0 then
insert into public.notifications (user_id, text, href) values (v_owner, 'Seus créditos de respostas acabaram. A assistente pausa até o próximo mês, ou compre um novo pacote.', '/planos');
end if;
end if;
return jsonb_build_object('usage_id', v_usage, 'used_month', v_used, 'limit', v_limit, 'from_credit', v_from, 'credits_left', v_left, 'uncovered', v_limit > 0 and v_used > v_limit and not v_from);
end $$;
