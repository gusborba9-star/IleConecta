-- PASSO 333: 0162_momentos_das_casas — parte 3 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Depois de publicado, só a ocultação/expiração por função da administração muda (não existe política de update para a casa).

-- ============ 3) bucket moments ============
create or replace function public.can_publish_moment(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.houses h where h.owner_id = (select auth.uid())
    and public.plan_cap_int(h.plan::text, 'moments_per_day') > 0
    and (p_name !~* '\.(mp4|webm|mov)$' or public.plan_cap_bool(h.plan::text, 'moment_video')));
$$;

revoke execute on function public.can_publish_moment(text) from public, anon;

grant execute on function public.can_publish_moment(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', true, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists moments_read on storage.objects;

drop policy if exists moments_insert on storage.objects;

drop policy if exists moments_delete on storage.objects;

create policy moments_read on storage.objects for select using (bucket_id = 'moments');

create policy moments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_publish_moment(name));

create policy moments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============ 5a) denúncias (antes da limpeza, que as consulta) ============
create table if not exists public.moment_reports (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null,
  house_id uuid not null references public.houses(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('conteudo_improprio', 'golpe', 'assedio', 'outro')),
  media_path text,
  poster_path text,
  media_kind text,
  caption text,
  status text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_note text,
  unique (story_id, reporter_id)
);

create index if not exists moment_reports_story on public.moment_reports (story_id);

create index if not exists moment_reports_open on public.moment_reports (status, created_at);

alter table public.moment_reports enable row level security;

revoke all on public.moment_reports from public, anon, authenticated;
