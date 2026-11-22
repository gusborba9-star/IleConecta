-- 0173 — Anúncios regionais seguem a cidade em que a pessoa está agora (22/11/2026).
-- Antes: só a cidade/estado do perfil. Agora o aparelho pode informar a cidade do momento (viagem); sem ela, vale o perfil.
-- Só muda QUEM VÊ o quê. Nada de pagamento, comissão, repasse, reembolso, preço ou vaga é tocado.
-- O país continua sendo o do perfil (padrão BR). A cidade informada só afeta o que a própria pessoa enxerga; o registro de visualização
-- continua único por pessoa/dia, então informar uma cidade falsa não infla contagem.

drop function if exists public.promotions_visible();
drop function if exists public.promo_track(uuid[], text);

create or replace function public.promotions_visible(p_city text default null, p_state text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_city text; v_state text; v_country text := 'BR'; v_now timestamptz := now(); v_pc text := public.promo_norm(left(p_city, 80)); v_ps text := public.promo_norm(left(p_state, 2));
begin
if auth.uid() is not null then
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = auth.uid();
v_country := coalesce(v_country, 'BR');
end if;
-- cidade do momento: só vale com cidade E estado válidos (2 letras)
if v_pc is not null and v_ps ~ '^[a-z]{2}$' then v_city := v_pc; v_state := v_ps; end if;
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

create or replace function public.promo_track(p_ids uuid[], p_kind text, p_city text default null, p_state text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record; v_ins int; v_vis jsonb;
begin
if auth.uid() is null then return 0; end if;
if p_kind not in ('view', 'open') then raise exception 'Tipo inválido.'; end if;
if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
if array_length(p_ids, 1) > 50 then raise exception 'Muitos itens de uma vez.'; end if;
v_vis := public.promotions_visible(p_city, p_state);
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

revoke all on function public.promo_track(uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.promo_track(uuid[], text, text, text) to authenticated, service_role;
revoke all on function public.promotions_visible(text, text) from public, anon, authenticated;
grant execute on function public.promotions_visible(text, text) to anon, authenticated, service_role;
