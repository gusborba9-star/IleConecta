-- 0175 — Alcance por aparelho, sem prometer «pessoas únicas» (22/11/2026).
-- O servidor não guarda histórico por pessoa além de 24 h; por isso quem informa se é a 1ª vez daquele anúncio NESTE aparelho é o próprio
-- aparelho (lista local). O banco só soma. Painel: visualizações, aparelhos com 1ª visualização (devices_new) e, por diferença, visualizações
-- de aparelhos recorrentes; frequência média estimada = visualizações ÷ aparelhos novos. Um aparelho pode ser mais de uma pessoa e vice-versa.
-- Não toca pagamento, comissão, repasse, reembolso, preço ou vaga.
alter table public.promo_stats add column if not exists devices_new int not null default 0;

drop function if exists public.promo_track(uuid[], text, text, text);
create or replace function public.promo_track(p_ids uuid[], p_kind text, p_city text default null, p_state text default null, p_new_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; r record; v_ins int; v_vis jsonb; v_new int;
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
v_new := case when p_kind = 'view' and p_new_ids is not null and r.id = any (p_new_ids) then 1 else 0 end;
insert into public.promo_stats (promotion_id, day, views, opens, devices_new) values (r.id, v_day, case when p_kind = 'view' then 1 else 0 end, case when p_kind = 'open' then 1 else 0 end, v_new)
on conflict (promotion_id, day) do update set views = public.promo_stats.views + excluded.views, opens = public.promo_stats.opens + excluded.opens, devices_new = public.promo_stats.devices_new + excluded.devices_new;
v_n := v_n + 1;
end if;
end loop;
return v_n;
end $$;
revoke all on function public.promo_track(uuid[], text, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.promo_track(uuid[], text, text, text, uuid[]) to authenticated, service_role;

-- funil da casa agora também traz aparelhos novos
create or replace function public.promo_funnel() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
    'chats', (select count(*) from public.promo_conversions c where c.promotion_id = p.id and c.ref_type = 'conversation'),
    'checkouts', (select count(*) from public.promo_conversions c where c.promotion_id = p.id and c.ref_type in ('service_order', 'reservation')),
    'payments', (select count(*) from public.promo_conversions c where c.promotion_id = p.id and (
      (c.ref_type = 'reservation' and exists (select 1 from public.reservations r where r.id = c.ref_id and r.status = 'confirmada'))
      or (c.ref_type = 'service_order' and exists (select 1 from public.service_orders o where o.id = c.ref_id and o.status in ('confirmado', 'em_andamento', 'concluido'))))),
    'devices_new', coalesce((select sum(st.devices_new) from public.promo_stats st where st.promotion_id = p.id), 0)
  )) from public.promotions p join public.houses h on h.id = p.house_id where h.owner_id = auth.uid()), '[]'::jsonb);
end $$;
