-- Reversão da 0077: remove o agendamento e a função. As reservas já expiradas continuam expiradas (estado correto).
do $$ begin perform cron.unschedule('expire-stale-holds'); exception when others then null; end $$;
drop function if exists public.expire_stale_holds();
