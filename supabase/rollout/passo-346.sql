-- PASSO 346: 0166_momentos_musica — parte 5 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 8) limpeza diária também recolhe arquivos de música sem faixa ============
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
    order by o.created_at limit p_limit)
  union all
  (with refs as (
     select 'avatars'::text b, substring(p.avatar_url from '/object/public/avatars/([^?#]+)') n from public.profiles p where p.avatar_url is not null
     union all select 'avatars', a.avatar_path from public.assistants a where a.avatar_path is not null
     union all select 'covers', substring(h.cover_url from '/object/public/covers/([^?#]+)') from public.houses h where h.cover_url is not null
     union all select 'covers', substring(e.cover_url from '/object/public/covers/([^?#]+)') from public.events e where e.cover_url is not null
     union all select 'post-images', substring(p.image_url from '/object/public/post-images/([^?#]+)') from public.posts p where p.image_url is not null
     union all select 'post-images', p.card_image_path from public.posts p where p.card_image_path is not null
     union all select 'chat-files', m.attachment_path from public.messages m where m.attachment_path is not null
     union all select rf.bucket, rf.path from public.report_files rf
     union all select ce.bucket, ce.path from public.support_case_evidence ce
   )
   select o.bucket_id::text, o.name, 'orphan'::text, null::uuid
     from storage.objects o
    where o.bucket_id in ('avatars', 'covers', 'post-images', 'chat-files') and o.created_at < now() - interval '2 days'
      and not exists (select 1 from refs r where r.b = o.bucket_id and r.n = o.name)
    order by o.created_at limit p_limit)
  union all
  -- músicas: arquivo no bucket sem faixa cadastrada (envio que não terminou, faixa apagada) sai depois de 1 dia
  (select 'music'::text, o.name, 'orphan'::text, null::uuid
     from storage.objects o
    where o.bucket_id = 'music' and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.music_tracks t where t.path = o.name)
    order by o.created_at limit p_limit);
$$;
