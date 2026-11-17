-- PASSO 314: 0148_escala_feed_e_avisos_de_atualizacao — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- reservas de ritual: quem reservou, a dona da casa do ritual e a equipe ativa
create or replace function public.live_ping_reservations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
  perform public.live_ping((
    select array_agg(distinct u) from (
      select r.user_id u from new_rows r
      union select h.owner_id from public.events e join public.houses h on h.id = e.house_id where e.id in (select r.event_id from new_rows r)
      union select s.user_id from public.events e join public.house_staff s on s.house_id = e.house_id and s.active where e.id in (select r.event_id from new_rows r)
    ) x), 'reservations');
  exception when others then raise warning 'live_ping reservations: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.live_ping_reservations() from public, anon, authenticated;

drop trigger if exists trg_live_ping_reservations_ins on public.reservations;

create trigger trg_live_ping_reservations_ins after insert on public.reservations referencing new table as new_rows for each statement execute function public.live_ping_reservations();

drop trigger if exists trg_live_ping_reservations_upd on public.reservations;

create trigger trg_live_ping_reservations_upd after update on public.reservations referencing new table as new_rows for each statement execute function public.live_ping_reservations();

-- reembolsos: o cliente, a dona da casa, a equipe ativa e a administração
create or replace function public.live_ping_refunds() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
  perform public.live_ping((
    select array_agg(distinct u) from (
      select r.client_id u from new_rows r
      union select h.owner_id from public.houses h where h.id in (select r.house_id from new_rows r)
      union select s.user_id from public.house_staff s where s.active and s.house_id in (select r.house_id from new_rows r)
      union select a.user_id from public.admins a
    ) x), 'refunds');
  exception when others then raise warning 'live_ping refunds: %', sqlerrm;
  end;
  return null;
end $$;

revoke all on function public.live_ping_refunds() from public, anon, authenticated;

drop trigger if exists trg_live_ping_refunds_ins on public.refund_requests;

create trigger trg_live_ping_refunds_ins after insert on public.refund_requests referencing new table as new_rows for each statement execute function public.live_ping_refunds();

drop trigger if exists trg_live_ping_refunds_upd on public.refund_requests;

create trigger trg_live_ping_refunds_upd after update on public.refund_requests referencing new table as new_rows for each statement execute function public.live_ping_refunds();

-- entra no tempo real (se a publicação existir) e limpa avisos antigos
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_pings') then
    alter publication supabase_realtime add table public.live_pings;
  end if;
end $$;

do $$
begin
  perform cron.schedule('purge-live-pings', '30 3 * * *', 'delete from public.live_pings where at < now() - interval ''30 days''');
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;
