-- 0203 — Dois erros de permissão em políticas de leitura, achados e corrigidos em 24/11/2026.
-- (1) Foto/PDF/vídeo do chat voltam a abrir ("Arquivo indisponível", 23/11/2026).
-- Causa: a política "evidence: admin lê provas de chamado" (0078/0139) consultava public.support_case_evidence direto, e essa tabela é fechada para o papel
-- authenticated (revoke all, de propósito). O Postgres confere a permissão de TODA tabela citada numa política antes de rodar a consulta, então qualquer leitura
-- em storage.objects feita por uma pessoa logada falhava com "permission denied for table support_case_evidence" — inclusive a que gera o link temporário
-- (o Storage respondia 400). O envio funcionava (o arquivo chegava), mas ninguém conseguia abrir o que estava em bucket privado.
-- Correção: a consulta à tabela fechada passa para uma função de servidor (security definer) que só responde para quem tem o módulo de suporte.
create or replace function public.support_evidence_visible(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.admin_can('suporte') and exists (select 1 from public.support_case_evidence e where e.path = p_path);
$$;
revoke all on function public.support_evidence_visible(text) from public, anon;
grant execute on function public.support_evidence_visible(text) to authenticated;

drop policy if exists "evidence: admin lê provas de chamado" on storage.objects;
create policy "evidence: admin lê provas de chamado" on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and public.admin_can('suporte') and public.support_evidence_visible(name));

-- (2) Visitante sem login voltava a ler as configurações públicas (preços, manutenção, limites).
-- Causa: a política da 0182 (só a administração lê a chave do vídeo) chamava public.is_admin() para TODOS os papéis, e o papel anon não pode executar essa
-- função; o Postgres confere isso antes de rodar a consulta, então a leitura inteira de platform_settings falhava para quem não estava logado.
-- Correção: duas políticas. A pública não chama função nenhuma; a da chave do vídeo vale só para quem está logado e é administração.
drop policy if exists settings_read on public.platform_settings;
create policy settings_read on public.platform_settings for select using (key <> 'video');
create policy settings_read_video on public.platform_settings for select to authenticated using (key = 'video' and public.is_admin());
