-- PASSO 34: 0073 — calendário com hora bloqueia 2 h e agenda única
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 3) Datas do calendário com horário bloqueiam 2 horas (só com o calendário ligado)
create or replace function public.house_calendar_blocks(p_house uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz) language sql stable security definer set search_path = public as $$
  select ((d::date)::timestamp + c.on_time) at time zone 'America/Sao_Paulo',
         ((d::date)::timestamp + c.on_time + interval '2 hours') at time zone 'America/Sao_Paulo'
    from generate_series(p_from::timestamp - interval '1 day', p_to::timestamp + interval '1 day', interval '1 day') d
    join public.house_calendar_items c on c.house_id = p_house and c.on_time is not null
     and ((c.yearly and extract(month from c.on_date) = extract(month from d) and extract(day from c.on_date) = extract(day from d))
          or c.on_date = d::date)
   where public.calendar_enabled();
$$;
revoke all on function public.house_calendar_blocks(uuid, date, date) from public, anon, authenticated;
grant execute on function public.house_calendar_blocks(uuid, date, date) to service_role;

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
  if not found or not svc.active or not svc.bookable or not public.service_purchasable(p_service) then return; end if;
  first_day := coalesce(p_from, (now() at time zone 'America/Sao_Paulo')::date);
  return query
  with cal as (select b.starts_at, b.ends_at from public.house_calendar_blocks(svc.house_id, first_day, first_day + n_days) b)
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
    and not exists (select 1 from cal where tstzrange(cal.starts_at, cal.ends_at) && tstzrange(t.s, t.e))
  order by t.s;
end $function$;

