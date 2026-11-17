-- PASSO 323: 0155_saude_da_plataforma_e_alertas — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('health-check', '*/10 * * * *', 'select public.health_check()');
    perform cron.schedule('purge-system-events', '55 3 * * *', 'select public.purge_system_events()');
  end if;
end $$;
