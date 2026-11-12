-- PASSO 57: 0080_rotinas_de_suporte — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
revoke all on function public.support_log_action(uuid, uuid, text, text, jsonb), public.support_files_pending(integer), public.support_files_queue(jsonb), public.support_files_done(uuid[]),
  public.auth_cleanup_pending_list(integer), public.auth_cleanup_mark(uuid, boolean, text), public.anonymize_account_and_queue(uuid, uuid) from public, anon, authenticated;

grant execute on function public.support_log_action(uuid, uuid, text, text, jsonb), public.support_files_pending(integer), public.support_files_queue(jsonb), public.support_files_done(uuid[]),
  public.auth_cleanup_pending_list(integer), public.auth_cleanup_mark(uuid, boolean, text), public.anonymize_account_and_queue(uuid, uuid) to service_role;

-- toda hora, às :20, a função de borda executa as exclusões vencidas e termina o que ficou pela metade
do $$
begin
  perform cron.unschedule('run-account-deletions');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('run-account-deletions', '20 * * * *', $job$
    select net.http_post(
      url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/support-admin',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'), '')),
      body := '{"action":"run_deletions"}'::jsonb)
  $job$);
exception when others then
  raise notice 'pg_cron indisponível: agende a chamada de support-admin manualmente';
end $$;
