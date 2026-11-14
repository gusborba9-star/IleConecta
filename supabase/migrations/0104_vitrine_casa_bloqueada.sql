-- 0104 — Casa em bloqueio total ou inativa sai da vitrine (decisão do proprietário, 13/11/2026, opção A).
-- Antes desta migration, a leitura de casas, publicações, serviços e eventos era aberta a todos: a casa bloqueada ou inativa continuava aparecendo.
-- Regras:
--  (1) casa em bloqueio total (falta de pagamento) ou inativa (assinatura cancelada/reembolsada) some da descoberta, da busca e do feed
--      (casas, publicações, stories, serviços, eventos, impulsionamentos); o link direto mostra "casa indisponível";
--  (2) continuam vendo a casa: a dona, a equipe, a administração e o cliente que tem pedido em andamento com ela (serviço confirmado/em andamento/
--      reembolso pendente, ou reserva confirmada de ritual que ainda não passou) para concluir o que já contratou;
--  (3) nada novo com a casa nesse estado, nem para esse cliente: reserva, fila de espera, pedido de serviço, seguir e abrir conversa nova são recusados;
--  (4) suspensão parcial NÃO esconde a casa (só pausa vendas novas, campanhas, destaques, impulsionamento e assistente).
-- Tudo no servidor: vale para o aplicativo, para o link direto e para qualquer chamada à API.

-- ============ 1) ajudantes ============
create or replace function public.house_billing_on() returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false);
$$;

create or replace function public.house_is_hidden(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select h is not null and public.house_billing_on() and exists (select 1 from public.house_billing_state s where s.house_id = h and (s.total or s.cancelled_at is not null));
$$;

-- pedido em andamento do cliente logado com a casa
create or replace function public.house_has_open_ties(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select auth.uid() is not null and (
exists (select 1 from public.service_orders o where o.house_id = h and o.client_id = auth.uid() and o.status in ('confirmado', 'em_andamento', 'reembolso_pendente'))
or exists (select 1 from public.reservations r join public.events e on e.id = r.event_id where e.house_id = h and r.user_id = auth.uid() and r.status = 'confirmada' and e.starts_at > now() - interval '1 day'));
$$;

create or replace function public.house_visible_to_me(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select not public.house_is_hidden(h) or public.is_admin() or public.is_house_owner(h)
or exists (select 1 from public.staff_row() s where s.house_id = h) or public.house_has_open_ties(h);
$$;

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

-- ============ 4) listagens por função (ignoram a política de leitura) ============
create or replace function public.house_featured()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(h.owner_id::text, x.until), '{}'::jsonb)
  from (select house_id, max(expires_at) until from public.house_rewards where expires_at > now() and starts_at <= now() group by house_id) x
  join public.houses h on h.id = x.house_id
  where not public.house_is_hidden(h.id);
$$;

create or replace function public.house_calendar(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_house uuid; v_own boolean := (p_owner = auth.uid()); v_follower boolean := false;
begin
  if not public.calendar_enabled() then return jsonb_build_object('enabled', false, 'items', '[]'::jsonb); end if;
  select id into v_house from public.houses where owner_id = p_owner;
  if v_house is null then return jsonb_build_object('enabled', true, 'items', '[]'::jsonb); end if;
  if not v_own and not public.house_visible_to_me(v_house) then return jsonb_build_object('enabled', true, 'items', '[]'::jsonb); end if;
  if not v_own and auth.uid() is not null then
    v_follower := exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.house_id = v_house);
  end if;
  return jsonb_build_object('enabled', true, 'items', coalesce((
    select jsonb_agg(
      jsonb_build_object('id', c.id, 'title', c.title, 'tradition', c.tradition, 'kind', c.kind, 'date', c.on_date, 'time', to_char(c.on_time, 'HH24:MI'), 'yearly', c.yearly, 'note', c.note)
      || case when v_own then jsonb_build_object('vis_public', c.vis_public, 'vis_followers', c.vis_followers, 'vis_house', c.vis_house, 'vis_assistant', c.vis_assistant) else '{}'::jsonb end
      order by c.on_date, c.on_time nulls last, c.title)
    from public.house_calendar_items c
    where c.house_id = v_house and (v_own or c.vis_public or (v_follower and c.vis_followers))), '[]'::jsonb));
end $$;

-- ============ 5) permissões ============
revoke all on function public.house_billing_on(), public.house_is_hidden(uuid), public.house_has_open_ties(uuid), public.house_visible_to_me(uuid),
public.hidden_house_new_guard(), public.hidden_house_conversation_guard() from public, anon, authenticated;
-- só a política de leitura precisa ser chamável por quem consulta; saber se uma casa está bloqueada não é público
grant execute on function public.house_visible_to_me(uuid) to anon, authenticated, service_role;
grant execute on function public.house_billing_on(), public.house_is_hidden(uuid), public.house_has_open_ties(uuid) to service_role;
grant execute on function public.house_featured() to anon, authenticated, service_role;
grant execute on function public.house_calendar(uuid) to anon, authenticated, service_role;
