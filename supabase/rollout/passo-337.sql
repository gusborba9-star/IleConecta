-- PASSO 337: 0163_momentos_curtir_comentar_ver — parte 1 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0163 — Momentos: curtir, comentar e visualizações (decisão do proprietário, 18/11/2026).
-- O cliente curte (coração) e comenta dentro do próprio momento; só a casa vê, com o nome de quem fez, e recebe aviso no sino (agrupado).
-- A casa vê a contagem de visualizações (todos os planos). Tudo some junto com o momento (48 h depois de expirar). Nada é lido por tabela:
-- só pelas funções abaixo (as tabelas não têm permissão direta).

-- ============ 1) tabelas ============
create table if not exists public.moment_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.moment_likes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.moment_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists moment_comments_story on public.moment_comments (story_id, created_at);

create index if not exists moment_comments_user_day on public.moment_comments (user_id, created_at);

alter table public.moment_views enable row level security;

alter table public.moment_likes enable row level security;

alter table public.moment_comments enable row level security;

revoke all on public.moment_views, public.moment_likes, public.moment_comments from public, anon, authenticated;

-- ============ 2) funções ============
create or replace function public.moment_like_text(p_name text, p_n integer) returns text
language sql immutable set search_path = public as $$
  select case when p_n <= 1 then p_name || ' curtiu seu momento.'
              when p_n = 2 then p_name || ' e mais 1 pessoa curtiram seu momento.'
              else p_name || ' e mais ' || (p_n - 1)::text || ' pessoas curtiram seu momento.' end;
$$;

-- momento vivo e visível para quem chama (dono da casa não conta como "outra pessoa")
create or replace function public.moment_target(p_story uuid, out o_house uuid, out o_owner uuid) returns record
language plpgsql stable security definer set search_path = public as $$
begin
  select s.house_id, h.owner_id into o_house, o_owner
    from public.stories s join public.houses h on h.id = s.house_id
   where s.id = p_story and s.expires_at > now() and s.hidden_at is null and s.purged_at is null and s.media_path is not null
     and public.house_visible_to_me(s.house_id);
end $$;

revoke all on function public.moment_target(uuid) from public, anon, authenticated;

create or replace function public.moment_view(p_story uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t record;
begin
  if v_uid is null then return; end if;
  select * into t from public.moment_target(p_story);
  if t.o_house is null or t.o_owner = v_uid then return; end if;
  insert into public.moment_views (story_id, viewer_id) values (p_story, v_uid) on conflict do nothing;
end $$;
