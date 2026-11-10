-- PASSO 15 de 18: 0067 e: available_slots
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

CREATE OR REPLACE FUNCTION public.available_slots(p_service uuid, p_from date DEFAULT NULL::date, p_days integer DEFAULT 14)
 RETURNS TABLE(slot timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  svc public.services%rowtype;
  first_day date;
  n_days integer := least(greatest(coalesce(p_days, 14), 1), 31);
begin
  select * into svc from public.services where id = p_service;
  if not found or not svc.active or not svc.bookable then return; end if;
  first_day := coalesce(p_from, (now() at time zone 'America/Sao_Paulo')::date);
  return query
  select t.s from (
    select ((d::date)::timestamp + a.start_time + make_interval(mins => n * svc.duration_min)) at time zone 'America/Sao_Paulo' as s,
           ((d::date)::timestamp + a.start_time + make_interval(mins => (n + 1) * svc.duration_min)) at time zone 'America/Sao_Paulo' as e
      from generate_series(first_day::timestamp, (first_day + (n_days - 1))::timestamp, interval '1 day') d
      join public.house_availability a on a.house_id = svc.house_id and a.weekday = extract(dow from d)::int
      cross join lateral generate_series(0, 287) n
     where (n + 1) * svc.duration_min <= extract(epoch from (a.end_time - a.start_time))::int / 60
  ) t
  where t.s >= now() + interval '2 hours'
    and not exists (
      select 1 from public.service_orders o
       where o.house_id = svc.house_id and o.scheduled_at is not null
         and (o.status in ('confirmado', 'em_andamento') or (o.status = 'aguardando_pagamento' and o.expires_at > now()))
         and tstzrange(o.scheduled_at, o.ends_at) && tstzrange(t.s, t.e))
    and not exists (
      select 1 from public.events ev
       where ev.house_id = svc.house_id and ev.status = 'publicado' and ev.duration_min is not null
         and tstzrange(ev.starts_at, ev.starts_at + make_interval(mins => ev.duration_min)) && tstzrange(t.s, t.e))
    and not exists (
      select 1 from public.house_blocks b
       where b.house_id = svc.house_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(t.s, t.e))
  order by t.s;
end $function$;

-- FIM DO PASSO 15
