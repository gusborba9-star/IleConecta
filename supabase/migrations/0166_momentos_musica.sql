-- 0166 — Momentos 2C: biblioteca de músicas livres de direitos (18/11/2026).
-- O proprietário cadastra faixas no painel (arquivo + título, autor, link da fonte, licença). Cada faixa pode ser ligada/desligada e há um
-- interruptor geral (DESLIGADO até o advogado liberar os direitos de uso). A casa escolhe uma faixa ao publicar FOTO; o visualizador toca com
-- botão de silenciar. Teto de 300 faixas, 8 MB por faixa e um teto de espaço total (500 MB), para não estourar o armazenamento do plano.
-- Faixa apagada ou desligada: o momento segue no ar, sem música. Arquivos sem faixa cadastrada saem na limpeza diária.

-- ============ 1) configuração geral (uma linha) ============
create table if not exists public.music_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  max_total_bytes bigint not null default 524288000 check (max_total_bytes between 1048576 and 5368709120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.music_settings enable row level security;
insert into public.music_settings (id) values (true) on conflict (id) do nothing;
revoke all on public.music_settings from public, anon, authenticated;

-- ============ 2) faixas ============
create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  author text not null check (char_length(btrim(author)) between 1 and 80),
  source_url text check (source_url is null or (source_url ~ '^https://[^\s<>"]+$' and char_length(source_url) <= 300)),
  license_note text check (license_note is null or char_length(license_note) <= 300),
  license_date date,
  path text not null unique check (path ~ '^[a-z0-9]{8,32}\.(mp3|m4a|ogg)$'),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.music_tracks enable row level security;
revoke all on public.music_tracks from public, anon, authenticated;
create index if not exists music_tracks_title on public.music_tracks (lower(title));

alter table public.stories add column if not exists music_id uuid references public.music_tracks(id) on delete set null;

-- ============ 3) armazenamento: só o proprietário envia/apaga; leitura pública (o player precisa do endereço) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', true, 8388608, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists music_read on storage.objects;
drop policy if exists music_insert on storage.objects;
drop policy if exists music_delete on storage.objects;
create policy music_read on storage.objects for select using (bucket_id = 'music');
create policy music_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'music' and public.admin_can('dono') and name ~ '^[a-z0-9]{8,32}\.(mp3|m4a|ogg)$');
create policy music_delete on storage.objects for delete to authenticated
  using (bucket_id = 'music' and public.admin_can('dono'));

-- ============ 4) catálogo para quem publica (só faixas ligadas, só com o interruptor geral ligado) ============
create or replace function public.music_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and (select enabled from public.music_settings)
    then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'author', t.author, 'path', t.path) order by lower(t.title)) from public.music_tracks t where t.active), '[]'::jsonb)
    else '[]'::jsonb end;
$$;
revoke all on function public.music_catalog() from public, anon;
grant execute on function public.music_catalog() to authenticated;

-- ============ 5) painel do proprietário ============
create or replace function public.admin_music_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', (select enabled from public.music_settings),
    'max_total_bytes', (select max_total_bytes from public.music_settings),
    'total_bytes', (select coalesce(sum(size_bytes), 0) from public.music_tracks),
    'max_count', 300,
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'author', t.author, 'source_url', t.source_url,
        'license_note', t.license_note, 'license_date', t.license_date, 'path', t.path, 'size_bytes', t.size_bytes, 'active', t.active,
        'created_at', t.created_at, 'uses', (select count(*) from public.stories s where s.music_id = t.id)) order by t.created_at desc) from public.music_tracks t), '[]'::jsonb));
end $$;
revoke all on function public.admin_music_list() from public, anon;
grant execute on function public.admin_music_list() to authenticated;

create or replace function public.admin_music_add(p_path text, p_title text, p_author text, p_source text, p_license text, p_license_date date, p_size integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total bigint; v_max bigint;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('music:add', 0));
  if (select count(*) from public.music_tracks) >= 300 then raise exception 'A biblioteca chegou ao limite de 300 faixas.'; end if;
  if p_path is null or p_path !~ '^[a-z0-9]{8,32}\.(mp3|m4a|ogg)$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'music' and o.name = p_path) then
    raise exception 'O arquivo da música precisa ser enviado pela própria plataforma (MP3, M4A ou OGG, até 8 MB).';
  end if;
  select coalesce(sum(size_bytes), 0), (select max_total_bytes from public.music_settings) into v_total, v_max from public.music_tracks;
  if coalesce(p_size, 0) < 1 or v_total + p_size > v_max then
    raise exception 'O espaço reservado para músicas (% MB) acabou. Apague faixas que não usa mais.', v_max / 1048576;
  end if;
  insert into public.music_tracks (title, author, source_url, license_note, license_date, path, size_bytes, created_by)
  values (btrim(p_title), btrim(p_author), nullif(btrim(coalesce(p_source, '')), ''), nullif(btrim(coalesce(p_license, '')), ''), p_license_date, p_path, p_size, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_music_add(text, text, text, text, text, date, integer) from public, anon;
grant execute on function public.admin_music_add(text, text, text, text, text, date, integer) to authenticated;

create or replace function public.admin_music_update(p_id uuid, p_title text, p_author text, p_source text, p_license text, p_license_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.music_tracks set title = btrim(p_title), author = btrim(p_author), source_url = nullif(btrim(coalesce(p_source, '')), ''),
    license_note = nullif(btrim(coalesce(p_license, '')), ''), license_date = p_license_date where id = p_id;
  if not found then raise exception 'Faixa não encontrada.'; end if;
end $$;
revoke all on function public.admin_music_update(uuid, text, text, text, text, date) from public, anon;
grant execute on function public.admin_music_update(uuid, text, text, text, text, date) to authenticated;

create or replace function public.admin_music_set_active(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Informe ligar ou desligar.'; end if;
  update public.music_tracks set active = p_on where id = p_id;
  if not found then raise exception 'Faixa não encontrada.'; end if;
end $$;
revoke all on function public.admin_music_set_active(uuid, boolean) from public, anon;
grant execute on function public.admin_music_set_active(uuid, boolean) to authenticated;

create or replace function public.admin_music_set_enabled(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare old_v boolean;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Informe ligar ou desligar.'; end if;
  select enabled into old_v from public.music_settings;
  update public.music_settings set enabled = p_on, updated_at = now(), updated_by = auth.uid() where id;
  insert into public.admin_audit (admin_id, key, old_value, new_value) values (auth.uid(), 'music_enabled', to_jsonb(old_v), to_jsonb(p_on));
end $$;
revoke all on function public.admin_music_set_enabled(boolean) from public, anon;
grant execute on function public.admin_music_set_enabled(boolean) to authenticated;

-- apaga a faixa e devolve o nome do arquivo (o painel remove o arquivo do armazenamento em seguida; se falhar, a limpeza diária remove)
create or replace function public.admin_music_delete(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from public.music_tracks where id = p_id returning path into v_path;
  if v_path is null then raise exception 'Faixa não encontrada.'; end if;
  return v_path;
end $$;
revoke all on function public.admin_music_delete(uuid) from public, anon;
grant execute on function public.admin_music_delete(uuid) to authenticated;

-- ============ 6) publicar com música: só em foto, só faixa ligada e só com o interruptor geral ligado ============
create or replace function public.stories_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_plan text; v_cap int; v_n int; v_ext text; v_re text;
begin
  select h.owner_id, h.plan::text into v_owner, v_plan from public.houses h where h.id = new.house_id;
  if v_owner is null then raise exception 'Casa não encontrada.'; end if;
  v_cap := public.plan_cap_int(v_plan, 'moments_per_day');
  if v_cap <= 0 then raise exception 'Momentos estão disponíveis a partir do plano Essencial.'; end if;
  v_re := '^' || v_owner::text || '/[A-Za-z0-9._-]+\.';
  if new.media_path is null or new.media_path !~* (v_re || '(jpe?g|png|webp|mp4|webm|mov)$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = new.media_path) then
    raise exception 'O arquivo do momento precisa ser enviado pela própria plataforma.';
  end if;
  v_ext := lower(substring(new.media_path from '\.([A-Za-z0-9]+)$'));
  new.media_kind := case when v_ext in ('mp4', 'webm', 'mov') then 'video' else 'image' end;
  if new.media_kind = 'video' then
    if not public.plan_cap_bool(v_plan, 'moment_video') then raise exception 'Momentos em vídeo estão disponíveis no plano Premium.'; end if;
    if new.poster_path is null or new.poster_path !~* (v_re || '(jpe?g|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = new.poster_path) then
      raise exception 'O vídeo do momento precisa de uma imagem de capa enviada pela plataforma.';
    end if;
    if new.duration_s is null or new.duration_s not between 1 and 31 then raise exception 'O vídeo pode ter até 30 segundos.'; end if;
  else
    new.poster_path := null;
    new.duration_s := null;
  end if;
  if new.link_kind = 'service' then
    if not exists (select 1 from public.services s where s.id = new.link_id and s.house_id = new.house_id and s.active) then raise exception 'O serviço escolhido não está disponível.'; end if;
  elsif new.link_kind = 'event' then
    if not exists (select 1 from public.events e where e.id = new.link_id and e.house_id = new.house_id and e.status = 'publicado') then raise exception 'O ritual escolhido não está disponível.'; end if;
  end if;
  new.caption := nullif(btrim(coalesce(new.caption, '')), '');
  perform pg_advisory_xact_lock(hashtextextended('moments:' || new.house_id::text, 0));
  select count(*) into v_n from public.moment_publish_log l where l.house_id = new.house_id and l.created_at > now() - interval '24 hours';
  if v_n >= v_cap then raise exception 'Você chegou ao limite de % momento(s) por dia do seu plano.', v_cap; end if;
  insert into public.moment_publish_log (house_id) values (new.house_id);
  if new.music_id is not null then
    if new.media_kind <> 'image' then new.music_id := null;
    elsif not coalesce((select ms.enabled from public.music_settings ms), false)
       or not exists (select 1 from public.music_tracks t where t.id = new.music_id and t.active) then
      raise exception 'A música escolhida não está disponível.';
    end if;
  end if;
  new.image_url := null;
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.hidden_at := null;
  new.purged_at := null;
  return new;
end $$;
revoke execute on function public.stories_guard() from public, anon, authenticated;

-- ============ 7) feed com a música (só se ligada e do momento em foto) ============
create or replace function public.moments_feed(p_limit integer default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.g order by x.latest desc) from (
      select max(s.created_at) as latest, jsonb_build_object(
          'owner_id', h.owner_id, 'house_id', h.id, 'name', h.name, 'slug', h.slug, 'avatar', p.avatar_url,
          'followed', exists (select 1 from public.follows f where f.follower_id = v_uid and f.house_id = h.id),
          'items', jsonb_agg(jsonb_build_object(
              'id', s.id, 'kind', s.media_kind, 'path', s.media_path, 'poster', s.poster_path, 'caption', s.caption,
              'created_at', s.created_at, 'expires_at', s.expires_at, 'duration', s.duration_s,
              'link_kind', case when sv.id is not null then 'service' when ev.id is not null then 'event' end,
              'link_id', coalesce(sv.id, ev.id), 'link_title', coalesce(sv.title, ev.title),
              'liked', exists (select 1 from public.moment_likes ml where ml.story_id = s.id and ml.user_id = v_uid),
              'views', case when h.owner_id = v_uid then (select count(*) from public.moment_views mv where mv.story_id = s.id) end,
              'likes', case when h.owner_id = v_uid then (select count(*) from public.moment_likes ml where ml.story_id = s.id) end,
              'comments', case when h.owner_id = v_uid then (select count(*) from public.moment_comments mc where mc.story_id = s.id) end,
              'music', case when mt.id is not null then jsonb_build_object('id', mt.id, 'title', mt.title, 'author', mt.author, 'path', mt.path) end) order by s.created_at)) as g
        from public.stories s
        join public.houses h on h.id = s.house_id
        join public.profiles p on p.id = h.owner_id
        left join public.services sv on s.link_kind = 'service' and sv.id = s.link_id and sv.house_id = s.house_id and sv.active
        left join public.events ev on s.link_kind = 'event' and ev.id = s.link_id and ev.house_id = s.house_id and ev.status = 'publicado'
        left join public.music_tracks mt on mt.id = s.music_id and mt.active and s.media_kind = 'image' and (select ms.enabled from public.music_settings ms)
       where s.expires_at > now() and s.hidden_at is null and s.purged_at is null and s.media_path is not null
         and public.house_visible_to_me(h.id)
       group by h.id, h.owner_id, h.name, h.slug, p.avatar_url
       order by max(s.created_at) desc
       limit greatest(1, least(coalesce(p_limit, 40), 60))) x), '[]'::jsonb);
end $$;

revoke all on function public.moments_feed(integer) from public, anon;
grant execute on function public.moments_feed(integer) to authenticated;

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
