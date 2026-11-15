-- PASSO 237: 0116_feed_publicacoes_e_resultados — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
