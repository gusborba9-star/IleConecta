-- PASSO 231: 0114_destaque_e_impulsionamento — parte 11 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 10) leituras ============
-- o que a casa pode ver agora: vagas por alcance e se já está na fila
create or replace function public.promo_availability() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h public.houses; v_city text; v_state text; v_country text; v_out jsonb := '{}'::jsonb; s text; v_limit int; v_taken int; v_mine boolean;
begin
select * into h from public.houses where owner_id = auth.uid() limit 1;
if not found then return jsonb_build_object('has_house', false); end if;
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = h.owner_id;
foreach s in array array['cidade', 'estado', 'pais'] loop
select highlight_slots into v_limit from public.promo_limits where scope = s;
v_taken := public.promo_slots_taken(s, case s when 'cidade' then v_city end, case when s in ('cidade', 'estado') then v_state end, case s when 'pais' then v_country end, h.id, now());
v_mine := public.promo_chain_end(h.id, 'highlight', s, null, now()) is not null;
v_out := v_out || jsonb_build_object(s, jsonb_build_object('limit', v_limit, 'taken', v_taken, 'full', v_taken >= v_limit and not v_mine, 'mine', v_mine,
'waiting', exists (select 1 from public.promo_waitlist w where w.house_id = h.id and w.scope = s),
'located', case s when 'cidade' then v_city is not null and v_state is not null when 'estado' then v_state is not null else true end));
end loop;
return jsonb_build_object('has_house', true, 'scopes', v_out);
end $$;

create or replace function public.promo_waitlist_join(p_scope text) returns void
language plpgsql security definer set search_path = public as $$
declare h public.houses; a jsonb;
begin
if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
if p_scope not in ('cidade', 'estado', 'pais') then raise exception 'Alcance inválido.'; end if;
select * into h from public.houses where owner_id = auth.uid() limit 1;
if not found then raise exception 'Somente a casa entra na lista de espera.'; end if;
a := public.promo_availability() -> 'scopes' -> p_scope;
if coalesce((a ->> 'full')::boolean, false) is not true then raise exception 'Há vaga disponível: você já pode contratar.'; end if;
insert into public.promo_waitlist (house_id, scope) values (h.id, p_scope) on conflict do nothing;
end $$;

create or replace function public.promo_waitlist_leave(p_scope text) returns void
language plpgsql security definer set search_path = public as $$
begin
if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
delete from public.promo_waitlist w using public.houses h where h.owner_id = auth.uid() and w.house_id = h.id and w.scope = p_scope;
end $$;

-- compras da casa: situação, contador (fim exato), dias restantes e reembolso possível
create or replace function public.my_promotions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h uuid; v_now timestamptz := now();
begin
select id into h from public.houses where owner_id = auth.uid() limit 1;
if h is null then return jsonb_build_object('has_house', false, 'items', '[]'::jsonb, 'window_days', 7); end if;
return jsonb_build_object('has_house', true, 'window_days', 7, 'items', coalesce((
select jsonb_agg(x order by (x ->> 'sort_at') desc) from (
select jsonb_build_object('id', p.id, 'kind', p.kind, 'scope', p.scope, 'item_type', p.item_type, 'item_id', p.item_id,
'title', case p.kind when 'highlight' then null when 'boost' then coalesce((select s.title from public.services s where s.id = p.item_id), (select e.title from public.events e where e.id = p.item_id)) end,
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
'sort_at', coalesce(public.promo_eff_start(p, v_now), p.created_at)) as x
from public.promotions p left join public.platform_charges c on c.id = p.charge_id
cross join lateral (select p.status = 'ativa' and c.status = 'paga' and c.paid_at + interval '7 days' >= v_now and c.paid_amount_cents is not null and c.paid_ref is not null
and p.days - public.promo_blocks_started(p, v_now) > 0 and not exists (select 1 from public.promo_refunds r where r.charge_id = p.charge_id and r.status in ('pendente', 'concluido')) as can_refund) cr
where p.house_id = h and p.status in ('ativa', 'encerrada', 'reembolsada') order by coalesce(p.starts_at, p.created_at) desc limit 40) t), '[]'::jsonb));
end $$;
