-- PASSO 215: 0111_plano_gratis — parte 6 de 8
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) limites do Grátis e conta de pagamento obrigatória para publicar ============
create or replace function public.house_payment_ready(p_house uuid) returns boolean
language sql stable security definer set search_path = public as $$
select exists (select 1 from public.house_payment_accounts a where a.house_id = p_house and a.charges_enabled);
$$;

create or replace function public.trg_services_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int;
begin
if auth.uid() is null or new.active is not true then return new; end if;
if tg_op = 'UPDATE' and old.active then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
v_lim := public.plan_cap_int(v_plan, 'limit_services');
if v_lim > 0 then
select count(*) into v_n from public.services where house_id = new.house_id and active and id <> new.id;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % serviços ativos do seu plano. Assine um plano para publicar mais.', v_lim; end if;
end if;
if v_plan = 'gratis' and coalesce(new.price_cents, 0) > 0 and not public.house_payment_ready(new.house_id) then
raise exception 'Para publicar serviços no plano Grátis, conecte primeiro a sua conta de recebimento (Painel da casa, em Recebimento pela plataforma). Os pagamentos dos serviços são feitos pela plataforma.';
end if;
return new;
end $$;

drop trigger if exists trg_services_plan_guard on public.services;

create trigger trg_services_plan_guard before insert or update of active on public.services
for each row execute function public.trg_services_plan_guard();

create or replace function public.trg_events_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int;
begin
if auth.uid() is null or new.status::text <> 'publicado' then return new; end if;
if tg_op = 'UPDATE' and old.status::text = 'publicado' then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
v_lim := public.plan_cap_int(v_plan, 'limit_rituals');
if v_lim > 0 then
select count(*) into v_n from public.events where house_id = new.house_id and status::text = 'publicado' and starts_at > now() and id <> new.id;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % rituais ativos do seu plano. Assine um plano para publicar mais.', v_lim; end if;
end if;
if v_plan = 'gratis' and coalesce(new.price_cents, 0) > 0 and not public.house_payment_ready(new.house_id) then
raise exception 'Para publicar rituais com valor no plano Grátis, conecte primeiro a sua conta de recebimento (Painel da casa, em Recebimento pela plataforma). Os pagamentos são feitos pela plataforma.';
end if;
return new;
end $$;

drop trigger if exists trg_events_plan_guard on public.events;

create trigger trg_events_plan_guard before insert or update of status on public.events
for each row execute function public.trg_events_plan_guard();

create or replace function public.trg_posts_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int; v_from timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
if auth.uid() is null or new.house_id is null then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
v_lim := public.plan_cap_int(v_plan, 'limit_posts_month');
if v_lim > 0 then
select count(*) into v_n from public.posts where house_id = new.house_id and created_at >= v_from;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % publicações por mês do seu plano. Assine um plano para publicar sem limite.', v_lim; end if;
end if;
return new;
end $$;
