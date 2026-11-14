-- PASSO 188: 0104_vitrine_casa_bloqueada — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 2) leitura: política restritiva (soma-se às regras de leitura que já existem) ============
do $$
declare t text; c text;
begin
for t, c in select * from (values ('houses', 'id'), ('posts', 'house_id'), ('stories', 'house_id'), ('services', 'house_id'), ('events', 'house_id'), ('boosts', 'house_id')) v(t, c) loop
execute format('drop policy if exists billing_hidden_sel on public.%I', t);
execute format('create policy billing_hidden_sel on public.%I as restrictive for select using (public.house_visible_to_me(%I))', t, c);
end loop;
end $$;

-- ============ 3) nada novo com a casa escondida ============
create or replace function public.hidden_house_new_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
if tg_table_name = 'reservations' then
select e.house_id into h from public.events e where e.id = new.event_id;
elsif tg_table_name = 'event_waitlist' then
select e.house_id into h from public.events e where e.id = new.event_id;
else
h := new.house_id;
end if;
if h is null or auth.uid() is null or public.is_admin() or not public.house_is_hidden(h) then return new; end if;
raise exception 'Esta casa não está disponível no momento.';
end $$;

drop trigger if exists trg_hidden_house_reservations on public.reservations;

create trigger trg_hidden_house_reservations before insert on public.reservations for each row execute function public.hidden_house_new_guard();

drop trigger if exists trg_hidden_house_waitlist on public.event_waitlist;

create trigger trg_hidden_house_waitlist before insert on public.event_waitlist for each row execute function public.hidden_house_new_guard();

drop trigger if exists trg_hidden_house_orders on public.service_orders;

create trigger trg_hidden_house_orders before insert on public.service_orders for each row execute function public.hidden_house_new_guard();

drop trigger if exists trg_hidden_house_follows on public.follows;

create trigger trg_hidden_house_follows before insert on public.follows for each row execute function public.hidden_house_new_guard();

-- conversa nova com a dona de uma casa escondida (a própria dona, a administração e quem já tem pedido em andamento seguem podendo)
create or replace function public.hidden_house_conversation_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
select id into h from public.houses where owner_id = new.user_id limit 1;
if h is null or not public.house_is_hidden(h) then return new; end if;
if auth.uid() is null or auth.uid() = new.user_id or public.is_admin() or public.house_has_open_ties(h) then return new; end if;
raise exception 'Esta casa não está disponível no momento.';
end $$;

drop trigger if exists trg_hidden_house_conversation on public.conversation_members;

create trigger trg_hidden_house_conversation before insert on public.conversation_members for each row execute function public.hidden_house_conversation_guard();
