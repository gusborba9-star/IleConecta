-- 0176 — Índice de equilíbrio da divulgação, só leitura, só administração (22/11/2026).
-- Por alcance (cidade, estado, país): exposição de cada casa = visualizações ÷ dias em que a campanha esteve efetivamente ATIVA e ELEGÍVEL
-- naquele alcance (dentro do período contratado; impulsionamento de ritual só até o início do ritual). Compara cada casa com a mediana do alcance.
-- A concentração é mostrada como distribuição (participação de cada casa e razão maior ÷ mediana), sem limite arbitrário de «equilíbrio».
-- NÃO altera o sorteio nem nada de pagamento. Pausas não são descontadas dia a dia (o início e o fim efetivos já deslocam a janela).
create or replace function public.admin_promo_equity(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_n int := greatest(1, least(coalesce(p_days, 30), 90)); v_to date := (now() at time zone 'America/Sao_Paulo')::date; v_from date; v_now timestamptz := now();
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  v_from := v_to - (v_n - 1);
  return coalesce((
    with promos as (
      select p.id, p.house_id, p.scope,
        p.scope || ':' || coalesce(case p.scope when 'pais' then p.country when 'estado' then p.state_key else coalesce(p.city_key, '') || '/' || coalesce(p.state_key, '') end, '') as grp,
        (public.promo_eff_start(p, v_now) at time zone 'America/Sao_Paulo')::date as d0,
        ((least(public.promo_eff_end(p, v_now), case when p.item_type = 'event' then (select e.starts_at from public.events e where e.id = p.item_id) end) - interval '1 second') at time zone 'America/Sao_Paulo')::date as d1
      from public.promotions p
      where p.status in ('ativa', 'encerrada') and p.starts_at is not null
    ),
    active as (
      select pr.grp, pr.house_id, count(distinct g.d::date) as active_days
      from promos pr cross join lateral generate_series(greatest(pr.d0, v_from), least(pr.d1, v_to), interval '1 day') g(d)
      group by 1, 2
    ),
    views as (
      select pr.grp, pr.house_id, coalesce(sum(st.views), 0)::bigint as views
      from promos pr left join public.promo_stats st on st.promotion_id = pr.id and st.day between v_from and v_to
      group by 1, 2
    ),
    per as (
      select a.grp, a.house_id, a.active_days, v.views, (v.views::numeric / a.active_days) as expo
      from active a join views v on v.grp = a.grp and v.house_id = a.house_id where a.active_days > 0
    ),
    stat as (
      select grp, count(*) as houses, sum(views) as total_views, percentile_cont(0.5) within group (order by expo) as med, max(expo) as top from per group by grp
    )
    select jsonb_agg(jsonb_build_object(
      'group', s.grp, 'houses', s.houses, 'total_views', s.total_views,
      'median_exposure', round(s.med::numeric, 2), 'top_exposure', round(s.top::numeric, 2),
      'top_ratio', case when s.med > 0 then round((s.top / s.med)::numeric, 1) end,
      'items', (select jsonb_agg(jsonb_build_object('house_id', x.house_id, 'name', (select h.name from public.houses h where h.id = x.house_id),
          'views', x.views, 'active_days', x.active_days, 'exposure', round(x.expo::numeric, 2),
          'share_pct', case when s.total_views > 0 then round(100.0 * x.views / s.total_views, 1) else 0 end) order by x.expo desc)
        from (select * from per where per.grp = s.grp order by expo desc limit 20) x)
    ) order by s.total_views desc)
    from stat s
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_promo_equity(int) from public, anon, authenticated;
grant execute on function public.admin_promo_equity(int) to authenticated, service_role;
