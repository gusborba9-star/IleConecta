-- PASSO 239: 0116_feed_publicacoes_e_resultados — parte 3 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
