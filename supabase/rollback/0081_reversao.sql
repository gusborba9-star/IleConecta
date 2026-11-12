-- Reversão da 0081 (assistente Conecta): remove o agendamento, as funções e a tabela de uso. Não toca em chamados.
do $$ begin perform cron.unschedule('purge-conecta-calls'); exception when others then null; end $$;
drop function if exists public.conecta_account_context();
drop function if exists public.conecta_allow(uuid);
drop function if exists public.purge_conecta_calls();
drop table if exists public.conecta_calls;
