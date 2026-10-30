-- Correção: as regras de leitura do admin consultavam report_files direto, e quem usa o app não tem permissão nessa tabela;
-- o erro derrubava a leitura de todos os arquivos. Agora a checagem passa por uma função própria. É seguro repetir.

create or replace function public.report_file_visible(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (select 1 from public.report_files f where f.bucket = p_bucket and f.path = p_path);
$$;
revoke all on function public.report_file_visible(text, text) from public, anon;
grant execute on function public.report_file_visible(text, text) to authenticated;

drop policy if exists "chat-files: admin lê o denunciado" on storage.objects;
drop policy if exists "evidence: admin lê" on storage.objects;
create policy "chat-files: admin lê o denunciado" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.report_file_visible('chat-files', name));
create policy "evidence: admin lê" on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and public.report_file_visible('report-evidence', name));
