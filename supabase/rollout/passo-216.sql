-- PASSO 216: 0111_plano_gratis — parte 7 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
drop trigger if exists trg_posts_plan_guard on public.posts;

create trigger trg_posts_plan_guard before insert on public.posts
for each row execute function public.trg_posts_plan_guard();

-- ============ 6) assistente no Grátis: só com pacote de respostas ============
create or replace function public.assistant_display_name(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select nullif(btrim(a.display_name), '')
from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and (public.assistant_monthly_limit(h.plan::text) > 0 or public.ai_credit_balance(h.id) > 0);
$$;

create or replace function public.assistant_avatar_path(p_owner uuid) returns text
language sql stable security definer set search_path = public as $$
select a.avatar_path from public.assistants a join public.houses h on h.id = a.house_id
where h.owner_id = p_owner and a.enabled and a.avatar_path is not null and (public.assistant_monthly_limit(h.plan::text) > 0 or public.ai_credit_balance(h.id) > 0);
$$;

create or replace function public.assistants_avatar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
if new.avatar_path is null then return new; end if;
if tg_op = 'UPDATE' and new.avatar_path is not distinct from old.avatar_path then return new; end if;
select owner_id into v_owner from public.houses where id = new.house_id;
if v_owner is null or split_part(new.avatar_path, '/', 1) <> v_owner::text then raise exception 'A foto da assistente precisa ser da própria casa.'; end if;
return new;
end $$;

create or replace function public.assistant_record_usage(p_house uuid, p_user uuid, p_model text, p_prompt integer, p_completion integer) returns jsonb
language plpgsql security definer set search_path = public as $$
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
if v_used > v_limit then
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
elsif v_owner is not null and v_from and v_left = 0 then
insert into public.notifications (user_id, text, href) values (v_owner, 'Seus créditos de respostas acabaram. A assistente pausa até você comprar um novo pacote ou assinar um plano com assistente.', '/planos');
end if;
return jsonb_build_object('usage_id', v_usage, 'used_month', v_used, 'limit', v_limit, 'from_credit', v_from, 'credits_left', v_left, 'uncovered', v_used > v_limit and not v_from);
end $$;
