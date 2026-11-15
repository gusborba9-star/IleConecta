-- 0116 — Feed com destaque, impulso de publicações e resultados por compra (decisões do proprietário, 15/11/2026).
-- Resultados: cada pessoa conta uma vez por dia por compra (aparição e abertura); guardamos só o total diário (promo_stats). O registro de quem viu (promo_events)
-- existe apenas para não contar duas vezes no mesmo dia e é apagado no dia seguinte. Nada disso é visível para outros usuários.

-- ============ 1) publicação como item impulsionável ============
alter table public.promotions drop constraint if exists promotions_item_type_check;
alter table public.promotions add constraint promotions_item_type_check check (item_type in ('service', 'event', 'post'));

-- ============ 2) resultados ============
create table if not exists public.promo_stats (
promotion_id uuid not null references public.promotions(id) on delete cascade,
day date not null,
views int not null default 0 check (views >= 0),
opens int not null default 0 check (opens >= 0),
primary key (promotion_id, day)
);
create table if not exists public.promo_events (
promotion_id uuid not null references public.promotions(id) on delete cascade,
viewer_id uuid not null references auth.users(id) on delete cascade,
kind text not null check (kind in ('view', 'open')),
day date not null,
primary key (promotion_id, viewer_id, kind, day)
);
alter table public.promo_stats enable row level security;
alter table public.promo_events enable row level security;

-- grava aparições e aberturas: só conta o que de fato está no ar para quem vê, uma vez por pessoa, por dia e por tipo; a própria casa não conta
create or replace function public.promo_track(p_ids uuid[], p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record; v_ins int; v_vis jsonb;
begin
if auth.uid() is null then return 0; end if;
if p_kind not in ('view', 'open') then raise exception 'Tipo inválido.'; end if;
if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
if array_length(p_ids, 1) > 50 then raise exception 'Muitos itens de uma vez.'; end if;
v_vis := public.promotions_visible();
for r in select distinct p.id from public.promotions p
where p.id = any (p_ids) and exists (select 1 from jsonb_array_elements(v_vis) e where (e ->> 'id')::uuid = p.id) and not exists (select 1 from public.houses h where h.id = p.house_id and h.owner_id = auth.uid()) loop
insert into public.promo_events (promotion_id, viewer_id, kind, day) values (r.id, auth.uid(), p_kind, v_day) on conflict do nothing;
get diagnostics v_ins = row_count;
if v_ins > 0 then
insert into public.promo_stats (promotion_id, day, views, opens) values (r.id, v_day, case when p_kind = 'view' then 1 else 0 end, case when p_kind = 'open' then 1 else 0 end)
on conflict (promotion_id, day) do update set views = public.promo_stats.views + excluded.views, opens = public.promo_stats.opens + excluded.opens;
v_n := v_n + 1;
end if;
end loop;
return v_n;
end $$;

-- ============ 3) compra com publicação ============
create or replace function public.platform_promo_purchase(p_house uuid, p_kind text, p_scope text, p_days int, p_item_type text, p_item_id uuid, p_authorized boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare h public.houses; v_city text; v_state text; v_country text; v_unit numeric; v_price bigint; v_id uuid; v_charge uuid; v_chain timestamptz; v_start timestamptz;
v_limit int; v_taken int; v_title text; v_ev timestamptz; v_max int; v_item uuid := p_item_id; v_itype text := p_item_type; ex public.promotions; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
if p_kind not in ('boost', 'highlight') then raise exception 'Tipo inválido.'; end if;
if p_scope not in ('cidade', 'estado', 'pais') then raise exception 'Alcance inválido.'; end if;
if p_days is null or p_days not between 1 and 90 then raise exception 'Escolha de 1 a 90 dias.'; end if;
if p_authorized is not true then raise exception 'Marque a autorização de início imediato para continuar.'; end if;
if (public.platform_billing_config() ->> 'enabled')::boolean is not true then raise exception 'cobranca_desligada'; end if;
perform pg_advisory_xact_lock(hashtextextended('promo:' || p_house::text, 0));
select * into h from public.houses where id = p_house;
if not found then raise exception 'Casa inexistente.'; end if;
if not public.promo_feature_on(p_kind, h.owner_id) then raise exception 'Este recurso ainda não está disponível para a sua casa.'; end if;
if public.house_billing_level(p_house) <> 'ok' then raise exception 'Regularize a fatura em atraso para contratar.'; end if;
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = h.owner_id;
if p_scope = 'cidade' and (v_city is null or v_state is null) then raise exception 'Complete a cidade e o estado no perfil da casa para contratar por cidade.'; end if;
if p_scope = 'estado' and v_state is null then raise exception 'Complete o estado no perfil da casa para contratar por estado.'; end if;
if p_kind = 'boost' then
if v_itype = 'service' then
select title into v_title from public.services where id = v_item and house_id = p_house and active and listed;
if v_title is null then raise exception 'Só serviços ativos da sua casa podem ser impulsionados.'; end if;
elsif v_itype = 'event' then
select title, starts_at into v_title, v_ev from public.events where id = v_item and house_id = p_house and status = 'publicado' and starts_at > now();
if v_title is null then raise exception 'Só rituais publicados e que ainda vão acontecer podem ser impulsionados.'; end if;
elsif v_itype = 'post' then
select left(content, 60) into v_title from public.posts where id = v_item and house_id = p_house and kind <> 'story';
if v_title is null then raise exception 'Só publicações da sua casa podem ser impulsionadas.'; end if;
else
raise exception 'Escolha o serviço, ritual ou publicação que será impulsionado.';
end if;
else
v_item := null; v_itype := null; v_title := h.name;
end if;
select * into ex from public.promotions pr where pr.house_id = p_house and pr.kind = p_kind and pr.scope = p_scope and pr.days = p_days and pr.item_id is not distinct from v_item
and pr.status = 'aguardando' and pr.created_at > now() - interval '1 hour' and pr.charge_id is not null
and exists (select 1 from public.platform_charges c where c.id = pr.charge_id and c.status = 'aberta') order by pr.created_at desc limit 1;
if found then return ex.charge_id; end if;
v_chain := public.promo_chain_end(p_house, p_kind, p_scope, v_item, now());
v_start := greatest(now(), coalesce(v_chain, now()));
if v_ev is not null then
v_max := floor(extract(epoch from v_ev - v_start) / 86400)::int;
if v_max < 1 then raise exception 'Este ritual acontece antes de um dia inteiro de impulsionamento.'; end if;
if p_days > v_max then raise exception 'O impulsionamento precisa terminar antes do ritual: no máximo % dia(s) para este ritual.', v_max; end if;
end if;
if p_kind = 'highlight' and v_chain is null then
perform pg_advisory_xact_lock(hashtextextended('promoslot:' || p_scope || ':' || coalesce(case p_scope when 'cidade' then v_city end, '') || ':' || coalesce(case when p_scope in ('cidade', 'estado') then v_state end, '') || ':' || coalesce(case p_scope when 'pais' then v_country end, ''), 0));
select highlight_slots into v_limit from public.promo_limits where scope = p_scope;
v_taken := public.promo_slots_taken(p_scope, case p_scope when 'cidade' then v_city end, case when p_scope in ('cidade', 'estado') then v_state end, case p_scope when 'pais' then v_country end, p_house, now());
if v_taken >= coalesce(v_limit, 0) then raise exception 'sem_vaga'; end if;
end if;
select nullif(value -> (case p_kind when 'boost' then 'boost_per_day' else 'highlight_per_day' end) ->> p_scope, '')::numeric into v_unit from public.platform_settings where key = 'pricing';
if v_unit is null or v_unit <= 0 then raise exception 'Este alcance não está disponível no momento.'; end if;
v_price := round(v_unit * 100)::bigint * p_days;
v_id := gen_random_uuid();
insert into public.promotions (id, house_id, kind, scope, item_type, item_id, days, amount_cents, authorized_at, city_key, state_key, country)
values (v_id, p_house, p_kind, p_scope, v_itype, v_item, p_days, v_price, now(),
case p_scope when 'cidade' then v_city end, case when p_scope in ('cidade', 'estado') then v_state end, case p_scope when 'pais' then v_country end);
v_charge := public.platform_charge_issue(p_house, p_kind, p_scope, v_price, v_today, null,
case p_kind when 'boost' then 'Impulsionamento de "' || left(v_title, 60) || '" por ' else 'Destaque da casa por ' end || p_days || ' dia(s), alcance: ' || p_scope, 'promo:' || v_id, v_id);
update public.promotions set charge_id = v_charge where id = v_id;
return v_charge;
end $$;

-- ============ 4) o que aparece para quem vê (agora com o código da compra e publicações) ============
create or replace function public.promotions_visible() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_city text; v_state text; v_country text := 'BR'; v_now timestamptz := now();
begin
if auth.uid() is not null then
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = auth.uid();
v_country := coalesce(v_country, 'BR');
end if;
return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'scope', p.scope, 'house_id', p.house_id, 'owner_id', (select h2.owner_id from public.houses h2 where h2.id = p.house_id), 'item_type', p.item_type, 'item_id', p.item_id)) from (
select * from public.promotions p where p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_start(p, v_now) <= v_now and public.promo_eff_end(p, v_now) > v_now
and not public.house_is_hidden(p.house_id)
and (case p.scope when 'pais' then p.country is not distinct from v_country
when 'estado' then v_state is not null and p.state_key is not distinct from v_state
else v_city is not null and v_state is not null and p.city_key is not distinct from v_city and p.state_key is not distinct from v_state end)
and (p.kind = 'highlight' or (p.item_type = 'service' and exists (select 1 from public.services s where s.id = p.item_id and s.active and s.listed))
or (p.item_type = 'event' and exists (select 1 from public.events e where e.id = p.item_id and e.status = 'publicado' and e.starts_at > v_now))
or (p.item_type = 'post' and exists (select 1 from public.posts po where po.id = p.item_id)))
limit 300) p), '[]'::jsonb);
end $$;

-- ============ 5) compras da casa (agora com resultados) ============
create or replace function public.my_promotions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; v_now timestamptz := now();
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'items', '[]'::jsonb, 'window_days', 7); end if;
return jsonb_build_object('has_house', true, 'window_days', 7, 'items', coalesce((
select jsonb_agg(x order by (x ->> 'sort_at') desc) from (
select jsonb_build_object('id', p.id, 'kind', p.kind, 'scope', p.scope, 'item_type', p.item_type, 'item_id', p.item_id,
'title', case p.kind when 'highlight' then null when 'boost' then coalesce((select s.title from public.services s where s.id = p.item_id), (select e.title from public.events e where e.id = p.item_id), (select left(po.content, 60) from public.posts po where po.id = p.item_id)) end,
'days', p.days, 'status', p.status, 'charge_id', p.charge_id, 'paid_cents', c.paid_amount_cents,
'starts_at', public.promo_eff_start(p, v_now), 'ends_at', public.promo_eff_end(p, v_now),
'running', p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_start(p, v_now) <= v_now and public.promo_eff_end(p, v_now) > v_now,
'queued', p.status = 'ativa' and public.promo_eff_start(p, v_now) > v_now,
'paused', p.status = 'ativa' and p.pause_started_at is not null,
'days_left', case when p.status = 'ativa' then p.days - public.promo_blocks_started(p, v_now) end,
'days_used', case when p.status = 'ativa' then public.promo_blocks_started(p, v_now) end,
'refund_cents', case when can_refund then public.promo_refund_cents(c.paid_amount_cents, p.days - public.promo_blocks_started(p, v_now), p.days) end,
'refund_days', case when can_refund then p.days - public.promo_blocks_started(p, v_now) end,
'refund_deadline', c.paid_at + interval '7 days',
'views', coalesce((select sum(st.views) from public.promo_stats st where st.promotion_id = p.id), 0), 'opens', coalesce((select sum(st.opens) from public.promo_stats st where st.promotion_id = p.id), 0),
'sort_at', coalesce(public.promo_eff_start(p, v_now), p.created_at)) as x
from public.promotions p left join public.platform_charges c on c.id = p.charge_id
cross join lateral (select p.status = 'ativa' and c.status = 'paga' and c.paid_at + interval '7 days' >= v_now and c.paid_amount_cents is not null and c.paid_ref is not null
and p.days - public.promo_blocks_started(p, v_now) > 0 and not exists (select 1 from public.promo_refunds r where r.charge_id = p.charge_id and r.status in ('pendente', 'concluido')) as can_refund) cr
where p.house_id = h and p.status in ('ativa', 'encerrada', 'reembolsada') order by coalesce(p.starts_at, p.created_at) desc limit 40) t), '[]'::jsonb));
end $$;

-- ============ 6) rotina (agora apaga o registro diário de quem viu) ============
create or replace function public.promotions_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_end int := 0; n_notice int := 0; n_wait int := 0; r record; v_limit int; v_taken int; v_owner uuid; v_exp int := 0;
begin
update public.promotions p set status = 'encerrada' where p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_end(p, p_now) <= p_now;
get diagnostics n_end = row_count;
update public.promotions p set status = 'cancelada' where p.status = 'aguardando' and p.created_at < p_now - interval '1 hour'
and not exists (select 1 from public.platform_charges c where c.id = p.charge_id and c.status = 'aberta');
-- aviso 1 dia antes do fim (só quando tem 2+ dias e não há renovação na fila)
for r in select p.id, p.house_id, p.kind, p.item_type, p.item_id, public.promo_eff_end(p, p_now) as ends from public.promotions p
where p.status = 'ativa' and p.pause_started_at is null and p.days >= 2 and p.end_notice_at is null and public.promo_eff_start(p, p_now) <= p_now
and public.promo_eff_end(p, p_now) > p_now and public.promo_eff_end(p, p_now) <= p_now + interval '24 hours'
and not exists (select 1 from public.promotions q where q.id <> p.id and q.house_id = p.house_id and q.kind = p.kind and q.scope = p.scope and q.item_id is not distinct from p.item_id and q.status = 'ativa' and public.promo_eff_start(q, p_now) >= public.promo_eff_end(p, p_now) - interval '1 second') loop
update public.promotions set end_notice_at = p_now where id = r.id;
select owner_id into v_owner from public.houses where id = r.house_id;
if v_owner is not null then
insert into public.notifications (user_id, text, href) values (v_owner,
case r.kind when 'highlight' then 'O destaque da sua casa termina ' else 'Um impulsionamento seu termina ' end || to_char(r.ends at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '. Renove para somar mais dias ao final.',
case r.kind when 'highlight' then '/destaques' else '/impulsionar' end);
end if;
n_notice := n_notice + 1;
end loop;
-- fila de espera: avisa a primeira casa de cada alcance e local que tiver vaga
for r in select distinct on (w.scope, case w.scope when 'cidade' then public.promo_norm(pf.city) when 'estado' then public.promo_norm(pf.state) else upper(coalesce(public.promo_norm(pf.country), 'br')) end, case when w.scope = 'cidade' then public.promo_norm(pf.state) end)
w.house_id, w.scope, h.owner_id, public.promo_norm(pf.city) as city, public.promo_norm(pf.state) as state, upper(coalesce(public.promo_norm(pf.country), 'br')) as country
from public.promo_waitlist w join public.houses h on h.id = w.house_id join public.profiles pf on pf.id = h.owner_id
order by w.scope, case w.scope when 'cidade' then public.promo_norm(pf.city) when 'estado' then public.promo_norm(pf.state) else upper(coalesce(public.promo_norm(pf.country), 'br')) end, case when w.scope = 'cidade' then public.promo_norm(pf.state) end, w.created_at loop
select highlight_slots into v_limit from public.promo_limits where scope = r.scope;
v_taken := public.promo_slots_taken(r.scope, case r.scope when 'cidade' then r.city end, case when r.scope in ('cidade', 'estado') then r.state end, case r.scope when 'pais' then r.country end, r.house_id, p_now);
if v_taken < coalesce(v_limit, 0) then
delete from public.promo_waitlist where house_id = r.house_id and scope = r.scope;
insert into public.notifications (user_id, text, href) values (r.owner_id, 'Abriu uma vaga de destaque no alcance que você esperava. Garanta a sua antes que alguém ocupe.', '/destaques');
n_wait := n_wait + 1;
end if;
end loop;
delete from public.promo_events where day < (p_now at time zone 'America/Sao_Paulo')::date;
return jsonb_build_object('ended', n_end, 'notices', n_notice, 'waitlist_called', n_wait);
end $$;

-- ============ 7) permissões ============
revoke all on public.promo_stats, public.promo_events from anon, authenticated;
revoke all on function public.promo_track(uuid[], text) from public, anon, authenticated;
grant execute on function public.promo_track(uuid[], text) to authenticated, service_role;
revoke all on function public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean), public.promotions_tick(timestamptz) from public, anon, authenticated;
grant execute on function public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean), public.promotions_tick(timestamptz) to service_role;
revoke all on function public.promotions_visible(), public.my_promotions() from public, anon, authenticated;
grant execute on function public.promotions_visible() to anon, authenticated, service_role;
grant execute on function public.my_promotions() to authenticated, service_role;
