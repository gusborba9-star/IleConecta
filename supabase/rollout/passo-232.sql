-- PASSO 232: 0114_destaque_e_impulsionamento — parte 12 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- o que aparece para quem está olhando (busca, feed, rituais): só compras rodando agora, no alcance de quem vê
create or replace function public.promotions_visible() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_city text; v_state text; v_country text := 'BR'; v_now timestamptz := now();
begin
if auth.uid() is not null then
select public.promo_norm(pf.city), public.promo_norm(pf.state), upper(coalesce(public.promo_norm(pf.country), 'br')) into v_city, v_state, v_country from public.profiles pf where pf.id = auth.uid();
v_country := coalesce(v_country, 'BR');
end if;
return coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'scope', p.scope, 'house_id', p.house_id, 'owner_id', (select h2.owner_id from public.houses h2 where h2.id = p.house_id), 'item_type', p.item_type, 'item_id', p.item_id)) from (
select * from public.promotions p where p.status = 'ativa' and p.pause_started_at is null and public.promo_eff_start(p, v_now) <= v_now and public.promo_eff_end(p, v_now) > v_now
and not public.house_is_hidden(p.house_id)
and (case p.scope when 'pais' then p.country is not distinct from v_country
when 'estado' then v_state is not null and p.state_key is not distinct from v_state
else v_city is not null and v_state is not null and p.city_key is not distinct from v_city and p.state_key is not distinct from v_state end)
and (p.kind = 'highlight' or (p.item_type = 'service' and exists (select 1 from public.services s where s.id = p.item_id and s.active and s.listed))
or (p.item_type = 'event' and exists (select 1 from public.events e where e.id = p.item_id and e.status = 'publicado' and e.starts_at > v_now)))
limit 300) p), '[]'::jsonb);
end $$;

-- ============ 11) admin: vagas do destaque (com motivo e auditoria) ============
create or replace function public.admin_set_promo_limit(p_scope text, p_slots int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old int;
begin
if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
if p_scope not in ('cidade', 'estado', 'pais') then raise exception 'Alcance inválido.'; end if;
if p_slots is null or p_slots not between 1 and 1000 then raise exception 'Informe de 1 a 1000 vagas.'; end if;
if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then raise exception 'Informe o motivo (3 a 300 caracteres).'; end if;
select highlight_slots into v_old from public.promo_limits where scope = p_scope for update;
update public.promo_limits set highlight_slots = p_slots, updated_at = now() where scope = p_scope;
insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'promo_limit', jsonb_build_object('scope', p_scope, 'slots', v_old), jsonb_build_object('scope', p_scope, 'slots', p_slots, 'reason', btrim(p_reason)));
end $$;

-- ============ 12) permissões ============
revoke all on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds from anon, authenticated;

grant select on public.promo_limits, public.promotions, public.promo_waitlist, public.promo_refunds to authenticated;

revoke all on function public.promotions_guard(), public.promo_refunds_guard(), public.promo_norm(text), public.promo_paused_secs(public.promotions, timestamptz), public.promo_eff_start(public.promotions, timestamptz),
public.promo_eff_end(public.promotions, timestamptz), public.promo_blocks_started(public.promotions, timestamptz), public.promo_refund_cents(bigint, int, int), public.promo_feature_on(text, uuid),
public.promo_house_paused(uuid), public.promo_slots_taken(text, text, text, text, uuid, timestamptz), public.promo_chain_end(uuid, text, text, uuid, timestamptz),
public.promo_rechain(uuid, text, text, uuid, timestamptz), public.promotion_deliver(uuid, timestamptz), public.promotions_on_charge(), public.promotions_sync_pause(),
public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean), public.platform_promo_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_promo_refund_done(uuid, text, timestamptz),
public.platform_promo_refund_fail(uuid, text), public.platform_promo_refunds_pending(interval), public.promotions_tick(timestamptz) from public, anon, authenticated;

grant execute on function public.promo_refund_cents(bigint, int, int), public.promo_feature_on(text, uuid), public.promo_house_paused(uuid), public.promo_slots_taken(text, text, text, text, uuid, timestamptz), public.promo_chain_end(uuid, text, text, uuid, timestamptz),
public.promo_rechain(uuid, text, text, uuid, timestamptz), public.promotion_deliver(uuid, timestamptz), public.platform_promo_purchase(uuid, text, text, int, text, uuid, boolean),
public.platform_promo_refund_begin(uuid, uuid, uuid, timestamptz), public.platform_promo_refund_done(uuid, text, timestamptz), public.platform_promo_refund_fail(uuid, text),
public.platform_promo_refunds_pending(interval), public.promotions_tick(timestamptz) to service_role;

grant execute on function public.promo_availability(), public.promo_waitlist_join(text), public.promo_waitlist_leave(text), public.my_promotions(), public.admin_set_promo_limit(text, int, text) to authenticated, service_role;

grant execute on function public.promotions_visible() to anon, authenticated, service_role;
