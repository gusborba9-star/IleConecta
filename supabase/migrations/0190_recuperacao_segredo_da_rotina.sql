-- 0190 — A rotina da fila se identifica com o segredo do Vault; a função confere direto no banco (sem segredo copiado à mão).
create or replace function public.recovery_cron_ok(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret is not null and exists (select 1 from vault.decrypted_secrets where name = 'recovery_cron_secret' and decrypted_secret = p_secret), false)
$$;
revoke all on function public.recovery_cron_ok(text) from public, anon, authenticated;
grant execute on function public.recovery_cron_ok(text) to service_role;
