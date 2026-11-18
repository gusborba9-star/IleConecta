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

create or replace function public.moment_like(p_story uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t record; v_new int; v_name text;
begin
  if v_uid is null then raise exception 'Entre na sua conta para curtir.' using errcode = '42501'; end if;
  select * into t from public.moment_target(p_story);
  if t.o_house is null then raise exception 'Momento indisponível.'; end if;
  if t.o_owner = v_uid then raise exception 'Você não pode curtir o próprio momento.'; end if;
  if exists (select 1 from public.user_blocks b where b.blocker_id = t.o_owner and b.blocked_id = v_uid) then raise exception 'Não foi possível curtir este momento.'; end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = v_uid) then raise exception 'Sua conta está suspensa. Fale com o suporte para entender o motivo.'; end if;
  if not coalesce(p_on, false) then
    delete from public.moment_likes where story_id = p_story and user_id = v_uid;
    return false;
  end if;
  insert into public.moment_likes (story_id, user_id) values (p_story, v_uid) on conflict do nothing;
  begin
    if coalesce((select np.notify_likes from public.notification_prefs np where np.user_id = t.o_owner), true) then
      insert into public.social_notice_log (kind, actor_id, ref_id) values ('like', v_uid, p_story) on conflict do nothing;
      get diagnostics v_new = row_count;
      if v_new > 0 then
        v_name := coalesce(public.social_actor_name(v_uid), 'Alguém');
        insert into public.notifications (user_id, text, href, kind, ref_id, actor_id, grouped)
          values (t.o_owner, public.moment_like_text(v_name, 1), '/comunidade', 'like', p_story, v_uid, 1)
          on conflict (user_id, ref_id) where kind = 'like' and read = false
          do update set grouped = public.notifications.grouped + 1, actor_id = excluded.actor_id,
                        text = public.moment_like_text(v_name, public.notifications.grouped + 1), created_at = now();
      end if;
    end if;
  exception when others then null;
  end;
  return true;
end $$;

create or replace function public.moment_comment(p_story uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t record; v_body text := btrim(coalesce(p_body, '')); v_id uuid; v_name text;
begin
  if v_uid is null then raise exception 'Entre na sua conta para comentar.' using errcode = '42501'; end if;
  if char_length(v_body) = 0 then raise exception 'Escreva o comentário.'; end if;
  if char_length(v_body) > 300 then raise exception 'O comentário pode ter até 300 caracteres.'; end if;
  select * into t from public.moment_target(p_story);
  if t.o_house is null then raise exception 'Momento indisponível.'; end if;
  if t.o_owner = v_uid then raise exception 'Use o chat para falar com quem comentou.'; end if;
  if exists (select 1 from public.user_blocks b where b.blocker_id = t.o_owner and b.blocked_id = v_uid) then raise exception 'Não foi possível comentar neste momento.'; end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = v_uid) then raise exception 'Sua conta está suspensa. Fale com o suporte para entender o motivo.'; end if;
  if (select count(*) from public.moment_comments c where c.user_id = v_uid and c.created_at > now() - interval '24 hours') >= 30 then raise exception 'Muitos comentários hoje. Tente novamente amanhã.'; end if;
  if (select count(*) from public.moment_comments c where c.user_id = v_uid and c.story_id = p_story) >= 5 then raise exception 'Você já comentou bastante neste momento. Fale com a casa pelo chat.'; end if;
  insert into public.moment_comments (story_id, user_id, body) values (p_story, v_uid, v_body) returning id into v_id;
  begin
    if coalesce((select np.notify_comments from public.notification_prefs np where np.user_id = t.o_owner), true) then
      v_name := coalesce(public.social_actor_name(v_uid), 'Alguém');
      insert into public.notifications (user_id, text, href, kind, ref_id, actor_id, grouped)
        values (t.o_owner, v_name || ' comentou no seu momento.', '/comunidade', 'comment', p_story, v_uid, 1)
        on conflict (user_id, ref_id, actor_id) where kind = 'comment' and read = false
        do update set grouped = public.notifications.grouped + 1,
                      text = v_name || ' comentou ' || (public.notifications.grouped + 1)::text || ' vezes no seu momento.', created_at = now();
    end if;
  exception when others then null;
  end;
  return v_id;
end $$;

-- só a casa: contagens, quem curtiu e comentários (com o nome)
create or replace function public.moment_stats(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_house uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select s.house_id into v_house from public.stories s where s.id = p_story and s.expires_at > now() - interval '2 days';
  if v_house is null or not public.is_house_owner(v_house) then raise exception 'Momento indisponível.'; end if;
  return jsonb_build_object(
    'views', (select count(*) from public.moment_views v where v.story_id = p_story),
    'likes', (select count(*) from public.moment_likes l where l.story_id = p_story),
    'comments_count', (select count(*) from public.moment_comments c where c.story_id = p_story),
    'likers', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', public.social_actor_name(x.user_id), 'avatar', p.avatar_url, 'at', x.created_at) order by x.created_at desc)
        from (select * from public.moment_likes l where l.story_id = p_story order by l.created_at desc limit 100) x join public.profiles p on p.id = x.user_id), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.user_id, 'name', public.social_actor_name(x.user_id), 'avatar', p.avatar_url, 'body', x.body, 'at', x.created_at) order by x.created_at desc)
        from (select * from public.moment_comments c where c.story_id = p_story order by c.created_at desc limit 100) x join public.profiles p on p.id = x.user_id), '[]'::jsonb));
end $$;

create or replace function public.moment_comment_delete(p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c record;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select mc.id, mc.user_id, s.house_id into c from public.moment_comments mc join public.stories s on s.id = mc.story_id where mc.id = p_comment;
  if c.id is null then return; end if;
  if c.user_id <> v_uid and not public.is_house_owner(c.house_id) then raise exception 'Operação inválida.'; end if;
  delete from public.moment_comments where id = p_comment;
end $$;

revoke all on function public.moment_view(uuid), public.moment_like(uuid, boolean), public.moment_comment(uuid, text), public.moment_stats(uuid), public.moment_comment_delete(uuid) from public, anon;

grant execute on function public.moment_view(uuid), public.moment_like(uuid, boolean), public.moment_comment(uuid, text), public.moment_stats(uuid), public.moment_comment_delete(uuid) to authenticated;

-- ============ 3) carrossel: cada item ganha "curti" e, para a casa, as contagens ============
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
              'comments', case when h.owner_id = v_uid then (select count(*) from public.moment_comments mc where mc.story_id = s.id) end) order by s.created_at)) as g
        from public.stories s
        join public.houses h on h.id = s.house_id
        join public.profiles p on p.id = h.owner_id
        left join public.services sv on s.link_kind = 'service' and sv.id = s.link_id and sv.house_id = s.house_id and sv.active
        left join public.events ev on s.link_kind = 'event' and ev.id = s.link_id and ev.house_id = s.house_id and ev.status = 'publicado'
       where s.expires_at > now() and s.hidden_at is null and s.purged_at is null and s.media_path is not null
         and public.house_visible_to_me(h.id)
       group by h.id, h.owner_id, h.name, h.slug, p.avatar_url
       order by max(s.created_at) desc
       limit greatest(1, least(coalesce(p_limit, 40), 60))) x), '[]'::jsonb);
end $$;

revoke all on function public.moments_feed(integer) from public, anon;

grant execute on function public.moments_feed(integer) to authenticated;

-- ============ 4) limpeza: interações somem 48 h depois que o momento expira ============
do $$
begin
  perform cron.schedule('purge-moment-interactions', '58 3 * * *',
    $q$delete from public.moment_comments where story_id in (select id from public.stories where expires_at < now() - interval '2 days');
       delete from public.moment_likes where story_id in (select id from public.stories where expires_at < now() - interval '2 days');
       delete from public.moment_views where story_id in (select id from public.stories where expires_at < now() - interval '2 days')$q$);
exception when others then
  raise notice 'pg_cron indisponível: agende a limpeza manualmente';
end $$;
