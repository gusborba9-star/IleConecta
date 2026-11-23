-- 0182 — A configuração do vídeo (casas de teste e serviço escolhido) deixa de ser legível por qualquer pessoa logada (23/11/2026).
-- Até aqui todas as chaves de platform_settings eram públicas; a do vídeo guarda códigos de contas de teste, que só a administração precisa ver.
-- O banco continua lendo a chave por dentro (video_enabled_for e video_schedule são security definer).
drop policy if exists settings_read on public.platform_settings;
create policy settings_read on public.platform_settings for select using (key <> 'video' or public.is_admin());
