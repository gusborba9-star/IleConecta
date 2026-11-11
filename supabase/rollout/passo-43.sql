-- PASSO 43: 0077 — retenções vencidas expiram sozinhas (função + agendamento de 1 minuto)
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
create or replace function public.expire_stale_holds()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n_res integer;
  n_ord integer;
begin
  -- o gatilho notify_waitlist_on_free_seat avisa a fila quando a reserva vira expirada
  with r as (
    update public.reservations set status = 'expirada'
     where status = 'aguardando_pagamento' and expires_at <= now()
    returning id)
  select count(*) into n_res from r;
  with o as (
    update public.service_orders set status = 'expirado'
     where scheduled_at is not null and status = 'aguardando_pagamento' and expires_at <= now()
    returning id)
  select count(*) into n_ord from o;
  update public.payments p set status = 'falhou'
   where p.status = 'pendente' and (
     exists (select 1 from public.reservations r where r.id = p.reservation_id and r.status = 'expirada')
     or exists (select 1 from public.service_orders o where o.id = p.order_id and o.status = 'expirado'));
  return coalesce(n_res, 0) + coalesce(n_ord, 0);
end $$;
revoke all on function public.expire_stale_holds() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('expire-stale-holds', '* * * * *', 'select public.expire_stale_holds()');
exception when others then
  raise notice 'pg_cron indisponível: agende expire_stale_holds() manualmente';
end $$;
