-- Reversão da 0080 (rotinas de suporte): remove a rotina horária de exclusões e as filas; devolve a purge_support_cases da 0078.
-- ATENÇÃO: as filas guardam arquivos a apagar e contas a fechar no Auth. Só reverta se estiverem vazias (confira antes).
do $$ begin perform cron.unschedule('run-account-deletions'); exception when others then null; end $$;
drop function if exists public.anonymize_account_and_queue(uuid, uuid);
drop function if exists public.auth_cleanup_mark(uuid, boolean, text);
drop function if exists public.auth_cleanup_pending_list(integer);
drop function if exists public.support_files_done(uuid[]);
drop function if exists public.support_files_pending(integer);
drop function if exists public.support_files_queue(jsonb);
drop function if exists public.support_log_action(uuid, uuid, text, text, jsonb);
drop table if exists public.support_files_to_remove;
drop table if exists public.auth_cleanup_pending;
create or replace function public.purge_support_cases()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.support_cases where purge_after is not null and purge_after < now() returning id) select count(*) into n from d;
  return n;
end $$;
revoke all on function public.purge_support_cases() from public, anon, authenticated;
