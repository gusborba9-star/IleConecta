-- PASSO 225: 0114_destaque_e_impulsionamento — parte 5 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 5) regras de local, vagas, fila e preço ============
create or replace function public.promo_feature_on(p_kind text, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((
select case f ->> 'state' when 'on' then true when 'beta' then p_owner is not null and (f -> 'beta_houses') ? p_owner::text else false end
from (select value -> (case p_kind when 'boost' then 'boost' else 'highlight' end) as f from public.platform_settings where key = 'features') x
where jsonb_typeof(f) = 'object'), false);
$$;

create or replace function public.promo_house_paused(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
select public.house_billing_level(h) <> 'ok';
$$;

-- vagas ocupadas por OUTRAS casas no mesmo alcance e local (reserva de pagamento pendente vale por 1 hora)
create or replace function public.promo_slots_taken(p_scope text, p_city text, p_state text, p_country text, p_exclude uuid, p_now timestamptz default now()) returns int
language sql stable security definer set search_path = public as $$
select count(distinct p.house_id)::int from public.promotions p
where p.kind = 'highlight' and p.scope = p_scope and p.house_id is distinct from p_exclude
and (case p_scope when 'cidade' then p.city_key is not distinct from p_city and p.state_key is not distinct from p_state
when 'estado' then p.state_key is not distinct from p_state else p.country is not distinct from p_country end)
and ((p.status = 'ativa' and public.promo_eff_end(p, p_now) > p_now) or (p.status = 'aguardando' and p.created_at > p_now - interval '1 hour'));
$$;

-- fim da fila do mesmo item e alcance (nulo = nada ativo)
create or replace function public.promo_chain_end(p_house uuid, p_kind text, p_scope text, p_item uuid, p_now timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = public as $$
select max(public.promo_eff_end(p, p_now)) from public.promotions p
where p.house_id = p_house and p.kind = p_kind and p.scope = p_scope and p.item_id is not distinct from p_item and p.status = 'ativa' and public.promo_eff_end(p, p_now) > p_now;
$$;

-- recoloca em fila as compras que ainda não começaram (depois de um reembolso, a de trás adianta)
create or replace function public.promo_rechain(p_house uuid, p_kind text, p_scope text, p_item uuid, p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = public as $$
declare r public.promotions; prev_end timestamptz := null; prev_pause timestamptz := null; paused boolean := public.promo_house_paused(p_house);
begin
for r in select * from public.promotions p where p.house_id = p_house and p.kind = p_kind and p.scope = p_scope and p.item_id is not distinct from p_item and p.status = 'ativa'
order by p.delivered_at, p.created_at, p.id for update loop
if public.promo_eff_start(r, p_now) > p_now or r.starts_at is null then
-- ainda não começou: entra logo depois da anterior (ou agora, se não sobrou anterior)
update public.promotions set starts_at = coalesce(prev_end, p_now), paused_seconds = 0, pause_started_at = case when paused then coalesce(prev_pause, p_now) else null end where id = r.id returning * into r;
end if;
prev_end := r.starts_at + make_interval(secs => r.paused_seconds::double precision) + r.days * interval '24 hours';
prev_pause := r.pause_started_at;
end loop;
end $$;
