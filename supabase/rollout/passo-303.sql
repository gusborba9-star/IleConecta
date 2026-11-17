-- PASSO 303: 0140_posts_com_a_cara_da_casa — parte 3 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 3) fotos de post ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_images_read on storage.objects;

drop policy if exists post_images_insert on storage.objects;

drop policy if exists post_images_delete on storage.objects;

create policy post_images_read on storage.objects for select using (bucket_id = 'post-images');

create policy post_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_use_styled_posts());

create policy post_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
