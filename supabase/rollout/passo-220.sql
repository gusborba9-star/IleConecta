-- PASSO 220: 0113_gratis_presencial_com_agenda — parte 1 de 1
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0113 — Plano Grátis: serviço presencial com valor precisa do agendamento pela plataforma.
-- Sem "Agendar horário pela plataforma", o serviço presencial fica sem botão de contratar e a venda sairia da plataforma,
-- o que o Grátis não permite (venda só pela plataforma, decisão do proprietário de 14/11/2026).
-- A regra da conta de recebimento passa a valer também quando a casa edita preço, entrega ou agendamento de um serviço já ativo.

create or replace function public.trg_services_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan text; v_lim int; v_n int;
begin
if auth.uid() is null or new.active is not true then return new; end if;
select plan::text into v_plan from public.houses where id = new.house_id;
if tg_op = 'INSERT' or not old.active then
v_lim := public.plan_cap_int(v_plan, 'limit_services');
if v_lim > 0 then
select count(*) into v_n from public.services where house_id = new.house_id and active and id <> new.id;
if v_n >= v_lim then raise exception 'Você chegou ao limite de % serviços ativos do seu plano. Assine um plano para publicar mais.', v_lim; end if;
end if;
end if;
if v_plan = 'gratis' and coalesce(new.price_cents, 0) > 0 then
if not public.house_payment_ready(new.house_id) then
raise exception 'Para publicar serviços no plano Grátis, conecte primeiro a sua conta de recebimento (Painel da casa, em Recebimento pela plataforma). Os pagamentos dos serviços são feitos pela plataforma.';
end if;
if new.delivery::text = 'presencial' and not coalesce(new.bookable, false) then
raise exception 'Para publicar serviços no plano Grátis, o serviço presencial precisa de "Agendar horário pela plataforma": a venda é feita pela plataforma.';
end if;
end if;
return new;
end $$;

drop trigger if exists trg_services_plan_guard on public.services;

create trigger trg_services_plan_guard before insert or update of active, bookable, delivery, price_cents on public.services
for each row execute function public.trg_services_plan_guard();

revoke all on function public.trg_services_plan_guard() from public, anon, authenticated;
