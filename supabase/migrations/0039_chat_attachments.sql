-- Chat: fotos e PDF (armazenamento privado) e provas na denúncia. É seguro repetir.
-- Arquivos ficam em buckets privados, com link temporário. Só quem está na conversa vê; o admin só vê o que entrou numa denúncia.

alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_size integer;

-- O arquivo precisa estar na pasta da própria conversa.
alter table public.messages drop constraint if exists messages_attachment_check;
alter table public.messages add constraint messages_attachment_check check (
  attachment_path is null or (
    attachment_path like conversation_id::text || '/%'
    and attachment_type in ('image/jpeg','image/png','image/webp','application/pdf')
    and attachment_size is not null and attachment_size <= 10485760
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('chat-files', 'chat-files', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('report-evidence', 'report-evidence', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Arquivos citados em denúncias (única porta de leitura do admin).
create table if not exists public.report_files (
  report_id uuid not null references public.chat_reports(id) on delete cascade,
  bucket text not null,
  path text not null,
  primary key (report_id, bucket, path)
);
alter table public.report_files enable row level security;
revoke all on public.report_files from anon, authenticated;

alter table public.chat_reports add column if not exists evidence jsonb not null default '[]'::jsonb;

drop policy if exists "chat-files: membros enviam" on storage.objects;
drop policy if exists "chat-files: membros leem" on storage.objects;
drop policy if exists "chat-files: admin lê o denunciado" on storage.objects;
drop policy if exists "evidence: enviar na própria pasta" on storage.objects;
drop policy if exists "evidence: dono lê" on storage.objects;
drop policy if exists "evidence: admin lê" on storage.objects;

create policy "chat-files: membros enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.is_conversation_member(((storage.foldername(name))[1])::uuid));

-- Quem está na conversa lê, enquanto a mensagem não foi apagada para todos.
create policy "chat-files: membros leem" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
    and exists (select 1 from public.messages m where m.attachment_path = name and m.deleted_at is null));

create policy "chat-files: admin lê o denunciado" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.is_admin()
    and exists (select 1 from public.report_files f where f.bucket = 'chat-files' and f.path = name));

create policy "evidence: enviar na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "evidence: dono lê" on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "evidence: admin lê" on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and public.is_admin()
    and exists (select 1 from public.report_files f where f.bucket = 'report-evidence' and f.path = name));

-- Denúncia com provas: guarda os arquivos das últimas 30 mensagens e os anexos enviados pelo denunciante.
drop function if exists public.report_user(uuid, text, text);
create or replace function public.report_user(p_other uuid, p_reason text, p_details text default null, p_evidence jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; snap jsonb; rid uuid; ev jsonb := '[]'::jsonb; e jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_other = auth.uid() then raise exception 'Operação inválida.'; end if;
  if p_reason not in ('spam','ofensa','golpe','conteudo_improprio','outro') then raise exception 'Motivo inválido.'; end if;
  if p_reason = 'outro' and length(trim(coalesce(p_details, ''))) < 10 then
    raise exception 'Descreva o que aconteceu (mínimo de 10 caracteres).';
  end if;
  select cm1.conversation_id into cid from public.conversation_members cm1
    join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
    where cm1.user_id = auth.uid() and cm2.user_id = p_other limit 1;
  select coalesce(jsonb_agg(x order by x.at), '[]'::jsonb) into snap from (
    select m.created_at as at, m.sender_id as sender, m.from_assistant as assistant,
           coalesce(a.original_text, m.text) as text, (m.deleted_at is not null) as deleted,
           case when m.attachment_path is null then null
                else jsonb_build_object('path', m.attachment_path, 'name', m.attachment_name, 'type', m.attachment_type) end as attachment
    from public.messages m left join public.message_archive a on a.message_id = m.id
    where m.conversation_id = cid order by m.created_at desc limit 30
  ) x;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) = 'array' then
    for e in select * from jsonb_array_elements(p_evidence) limit 5 loop
      if (e->>'path') like auth.uid()::text || '/%' then
        ev := ev || jsonb_build_array(jsonb_build_object('path', e->>'path', 'name', left(coalesce(e->>'name', 'arquivo'), 120), 'type', e->>'type'));
      end if;
    end loop;
  end if;
  insert into public.chat_reports (reporter_id, reported_id, conversation_id, reason, details, snapshot, evidence)
  values (auth.uid(), p_other, cid, p_reason, left(nullif(trim(coalesce(p_details, '')), ''), 1000), snap, ev)
  returning id into rid;
  insert into public.report_files (report_id, bucket, path)
    select rid, 'chat-files', m.attachment_path from public.messages m
    where m.conversation_id = cid and m.attachment_path is not null
      and m.created_at >= coalesce((select min((x->>'at')::timestamptz) from jsonb_array_elements(snap) x), now())
    on conflict do nothing;
  insert into public.report_files (report_id, bucket, path)
    select rid, 'report-evidence', x->>'path' from jsonb_array_elements(ev) x on conflict do nothing;
end $$;
revoke all on function public.report_user(uuid, text, text, jsonb) from public, anon;
grant execute on function public.report_user(uuid, text, text, jsonb) to authenticated;

-- Painel admin: devolve também as provas.
drop function if exists public.admin_chat_reports();
create or replace function public.admin_chat_reports()
returns table (id uuid, reporter_name text, reported_name text, reason text, details text, snapshot jsonb, evidence jsonb, status text, admin_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select r.id, coalesce(p1.display_name, '—'), coalesce(p2.display_name, '—'), r.reason, r.details, r.snapshot, r.evidence, r.status, r.admin_note, r.created_at
    from public.chat_reports r
    left join public.profiles p1 on p1.id = r.reporter_id
    left join public.profiles p2 on p2.id = r.reported_id
    order by (r.status = 'aberta') desc, r.created_at desc limit 100;
end $$;
revoke all on function public.admin_chat_reports() from public, anon;
grant execute on function public.admin_chat_reports() to authenticated;
