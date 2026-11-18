-- PASSO 342: 0166_momentos_musica — parte 1 de 5
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
