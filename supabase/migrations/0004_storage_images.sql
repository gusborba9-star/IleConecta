-- Buckets públicos de leitura para foto de perfil (avatars) e capa da casa (covers).
-- Escrita só pelo dono: o primeiro segmento do caminho precisa ser o id do usuário autenticado
-- (ex.: "<uid>/avatar-1730000000.jpg"). Limite de 5 MB e somente imagens.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('covers',  'covers',  true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists images_read   on storage.objects;
drop policy if exists images_insert on storage.objects;
drop policy if exists images_update on storage.objects;
drop policy if exists images_delete on storage.objects;

create policy images_read on storage.objects for select
  using (bucket_id in ('avatars','covers'));

create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','covers') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy images_update on storage.objects for update to authenticated
  using (bucket_id in ('avatars','covers') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('avatars','covers') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','covers') and (storage.foldername(name))[1] = (select auth.uid())::text);
