-- Limpeza de arquivos vencidos (LGPD: não guardar além do necessário). É seguro repetir.
-- Regras:
--  * Fotos dos registros do ritual: apagadas quando vencem (30 dias; vídeos, 7 dias). Arquivos sem registro (órfãos) com mais de 1 dia também.
--  * Anexos de mensagens apagadas para todos: apagados 30 dias depois (junto com o arquivo de texto).
--  * Provas de denúncias: apagadas 90 dias depois de a denúncia ser resolvida.
--  * Nada que esteja ligado a uma denúncia aberta, ou resolvida há menos de 90 dias, é apagado.
-- Quem apaga os arquivos é a função "purge-files" (precisa da API de armazenamento); o banco só diz o quê e limpa as referências.

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
    order by cr.resolved_at limit p_limit);
$$;

-- Depois que o arquivo saiu do armazenamento, limpa a referência no banco.
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
    else
      continue;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.files_to_purge(integer) from public, anon, authenticated;
revoke all on function public.files_purged(jsonb) from public, anon, authenticated;
grant execute on function public.files_to_purge(integer) to service_role;
grant execute on function public.files_purged(jsonb) to service_role;

-- Todo dia às 03:45 (UTC) chama a função de limpeza, com o mesmo segredo do Vault usado pelos avisos.
do $$
begin
  perform cron.unschedule('purge-expired-files');
exception when others then null;
end $$;
select cron.schedule('purge-expired-files', '45 3 * * *', $job$
  select net.http_post(
    url := 'https://filsjhnfrpnqukedlkhf.supabase.co/functions/v1/purge-files',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-push-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'), '')),
    body := '{}'::jsonb)
$job$);
