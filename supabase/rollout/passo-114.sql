-- PASSO 114: 0093_agenda_conferencia_cobranca — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: ativação da cobrança da plataforma, passo do banco da rotina diária de conferência.
-- (1) segredo próprio da rotina no Vault, gerado aqui dentro (o valor nunca sai do banco: quem chama a função lê do Vault);
-- (2) agenda diária, depois do motor das 06:20 de Brasília (09:20 UTC), que chama a função platform-billing com o segredo.
-- A conferência confere pagamentos em andamento e registra tarifas conhecidas depois do pagamento. O motor não depende dela.
-- Produção antes desta migration: o segredo platform_billing_cron_secret não existe e só o job platform-billing-tick está agendado.
-- Requer supabase_vault, pg_net e pg_cron (já ativos em produção).

-- ============ 2) agenda diária da conferência ============
select cron.unschedule(jobid) from cron.job where jobname = 'platform-billing-sweep';

select cron.schedule('platform-billing-sweep', '35 9 * * *', $cron$select net.http_post(url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/platform-billing', headers := jsonb_build_object('Content-Type', 'application/json', 'x-platform-billing-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'platform_billing_cron_secret'), '')), body := '{}'::jsonb)$cron$);
