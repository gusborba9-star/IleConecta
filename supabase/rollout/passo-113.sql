-- PASSO 113: 0093_agenda_conferencia_cobranca — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: ativação da cobrança da plataforma, passo do banco da rotina diária de conferência.
-- (1) segredo próprio da rotina no Vault, gerado aqui dentro (o valor nunca sai do banco: quem chama a função lê do Vault);
-- (2) agenda diária, depois do motor das 06:20 de Brasília (09:20 UTC), que chama a função platform-billing com o segredo.
-- A conferência confere pagamentos em andamento e registra tarifas conhecidas depois do pagamento. O motor não depende dela.
-- Produção antes desta migration: o segredo platform_billing_cron_secret não existe e só o job platform-billing-tick está agendado.
-- Requer supabase_vault, pg_net e pg_cron (já ativos em produção).

-- ============ 1) segredo da rotina ============
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'platform_billing_cron_secret', 'Rotina diária da cobrança da plataforma (platform-billing)')
where not exists (select 1 from vault.secrets where name = 'platform_billing_cron_secret');
