-- Fase 4: Platform Billing — segredo próprio da rotina da função e agendamento diário do motor.
-- O motor (platform_billing_tick) roda direto no banco, sem depender da função de backend nem do provedor: emite, avisa e suspende mesmo com o provedor fora do ar.
-- Com billing_config.enabled = false a rotina não faz nada. A chamada da função (conferência no provedor e tarifas) só é agendada na ativação.

-- ============ 1) segredo próprio da rotina (Vault: platform_billing_cron_secret); sem Vault nega sempre ============
create or replace function public.check_platform_billing_cron_secret(p_secret text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
if p_secret is null or p_secret = '' or to_regclass('vault.decrypted_secrets') is null then return false; end if;
return exists (select 1 from vault.decrypted_secrets where name = 'platform_billing_cron_secret' and decrypted_secret = p_secret);
end $$;

revoke all on function public.check_platform_billing_cron_secret(text) from public, anon, authenticated;

grant execute on function public.check_platform_billing_cron_secret(text) to service_role;

-- ============ 2) agendamento diário do motor, 06:20 no horário de Brasília ============
do $$
begin
perform cron.unschedule('platform-billing-tick');
exception when others then null;
end $$;

do $$
begin
perform cron.schedule('platform-billing-tick', '20 9 * * *', 'select public.platform_billing_tick()');
exception when others then
raise notice 'pg_cron indisponível: agende platform_billing_tick manualmente';
end $$;
