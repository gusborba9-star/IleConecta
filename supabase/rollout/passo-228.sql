-- PASSO 228: 0114_destaque_e_impulsionamento — parte 8 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 7) compra (chamada só pelo servidor de cobrança) ============
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
else
raise exception 'Escolha o serviço ou ritual que será impulsionado.';
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
