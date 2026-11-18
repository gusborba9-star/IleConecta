-- PASSO 336: 0162_momentos_das_casas — parte 6 de 6
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- ============ 6) carrossel do feed ============
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
              'link_id', coalesce(sv.id, ev.id), 'link_title', coalesce(sv.title, ev.title)) order by s.created_at)) as g
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
