-- PASSO 334: 0162_momentos_das_casas — parte 4 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 4) limpeza em 48 h ============
create or replace function public.files_to_purge(p_limit integer default 200)
returns table (bucket text, path text, kind text, ref uuid)
language sql stable security definer set search_path = public as $$
  (select 'ritual-records'::text, er.path, 'record'::text, er.id
     from public.event_records er
    where er.expires_at < now()
    order by er.expires_at limit p_limit)
  union all
  (select 'ritual-records'::text, o.name, 'orphan'::text, null::uuid
     from storage.objects o
    where o.bucket_id = 'ritual-records' and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.event_records er where er.path = o.name)
    order by o.created_at limit p_limit)
  union all
  (select 'chat-files'::text, m.attachment_path, 'chat'::text, m.id
     from public.messages m
    where m.deleted_at is not null and m.deleted_at < now() - interval '30 days'
      and m.attachment_path is not null
      and not exists (
        select 1 from public.report_files rf join public.chat_reports cr on cr.id = rf.report_id
         where rf.bucket = 'chat-files' and rf.path = m.attachment_path
           and (cr.status = 'aberta' or cr.resolved_at is null or cr.resolved_at > now() - interval '90 days'))
    order by m.deleted_at limit p_limit)
  union all
  (select rf.bucket, rf.path, 'evidence'::text, rf.report_id
     from public.report_files rf join public.chat_reports cr on cr.id = rf.report_id
    where rf.bucket = 'report-evidence' and cr.status = 'resolvida' and cr.resolved_at < now() - interval '90 days'
    order by cr.resolved_at limit p_limit)
  union all
  -- momentos: arquivo sai do armazenamento 48 h depois de publicado, salvo denúncia aberta (ou resolvida há menos de 90 dias)
  (select 'moments'::text, s.media_path, 'moment'::text, s.id
     from public.stories s
    where s.created_at < now() - interval '48 hours' and s.media_path is not null
      and not exists (select 1 from public.moment_reports r where (r.story_id = s.id or r.media_path = s.media_path)
                       and (r.status = 'aberta' or r.resolved_at > now() - interval '90 days'))
    order by s.created_at limit p_limit)
  union all
  (select 'moments'::text, s.poster_path, 'moment_poster'::text, s.id
     from public.stories s
    where s.created_at < now() - interval '48 hours' and s.poster_path is not null
      and not exists (select 1 from public.moment_reports r where (r.story_id = s.id or r.poster_path = s.poster_path)
                       and (r.status = 'aberta' or r.resolved_at > now() - interval '90 days'))
    order by s.created_at limit p_limit)
  union all
  -- arquivos do bucket sem momento (casa apagou o momento ou o envio não terminou): saem depois de 2 dias, salvo denúncia
  (select 'moments'::text, o.name, 'orphan'::text, null::uuid
     from storage.objects o
    where o.bucket_id = 'moments' and o.created_at < now() - interval '2 days'
      and not exists (select 1 from public.stories s where s.media_path = o.name or s.poster_path = o.name)
      and not exists (select 1 from public.moment_reports r where (r.media_path = o.name or r.poster_path = o.name)
                       and (r.status = 'aberta' or r.resolved_at > now() - interval '90 days'))
    order by o.created_at limit p_limit);
$$;

create or replace function public.files_purged(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare i jsonb; n integer := 0;
begin
  for i in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if i->>'kind' = 'record' then
      delete from public.event_records where id = (i->>'ref')::uuid;
    elsif i->>'kind' = 'orphan' then
      null; -- o arquivo já saiu do armazenamento; não há referência no banco
    elsif i->>'kind' = 'chat' then
      update public.messages set attachment_path = null, attachment_type = null, attachment_name = null, attachment_size = null
       where id = (i->>'ref')::uuid;
    elsif i->>'kind' = 'evidence' then
      delete from public.report_files where report_id = (i->>'ref')::uuid and bucket = i->>'bucket' and path = i->>'path';
    elsif i->>'kind' = 'moment' then
      update public.stories set media_path = null, purged_at = coalesce(purged_at, now()) where id = (i->>'ref')::uuid;
    elsif i->>'kind' = 'moment_poster' then
      update public.stories set poster_path = null, purged_at = coalesce(purged_at, now()) where id = (i->>'ref')::uuid;
    else
      continue;
    end if;
    -- momento sem nenhum arquivo e sem denúncia: a linha também sai (a prova de denúncia mantém a linha)
    if i->>'kind' in ('moment', 'moment_poster') then
      delete from public.stories s where s.id = (i->>'ref')::uuid and s.media_path is null and s.poster_path is null
        and not exists (select 1 from public.moment_reports r where r.story_id = s.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.files_to_purge(integer) from public, anon, authenticated;

revoke all on function public.files_purged(jsonb) from public, anon, authenticated;

grant execute on function public.files_to_purge(integer) to service_role;

grant execute on function public.files_purged(jsonb) to service_role;
