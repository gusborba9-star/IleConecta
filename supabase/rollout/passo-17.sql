-- PASSO 17 de 18: 0067 g: privacidade
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- ============ F2) privacidade de perfis e curtidas ============
-- Pessoas (clientes) deixam de ser legíveis por visitantes: só o próprio perfil, quem tem relação com ela e a administração.
create or replace function public.can_view_profile(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p = (select auth.uid())
    or public.is_admin()
    or exists (select 1 from public.conversation_members a join public.conversation_members b on b.conversation_id = a.conversation_id
                where a.user_id = (select auth.uid()) and b.user_id = p)
    or exists (select 1 from public.houses h where h.owner_id = (select auth.uid()) and (
         exists (select 1 from public.service_orders o where o.house_id = h.id and o.client_id = p)
      or exists (select 1 from public.reservations r join public.events e on e.id = r.event_id where e.house_id = h.id and r.user_id = p)
      or exists (select 1 from public.event_waitlist w join public.events e on e.id = w.event_id where e.house_id = h.id and w.user_id = p)
      or exists (select 1 from public.follows f where f.house_id = h.id and f.follower_id = p)
      or exists (select 1 from public.house_members m where m.house_id = h.id and m.user_id = p)
      or exists (select 1 from public.refund_requests rr where rr.house_id = h.id and rr.client_id = p)
      or exists (select 1 from public.post_comments c join public.posts po on po.id = c.post_id where po.house_id = h.id and c.user_id = p)
    ))
  );
$$;
revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to anon, authenticated, service_role;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to public
  using (account_type = 'casa' or id = (select auth.uid()) or public.can_view_profile(id));

drop policy if exists likes_read on public.post_likes;
create policy likes_read on public.post_likes for select to public
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.posts po join public.houses h on h.id = po.house_id
     where po.id = post_likes.post_id and h.owner_id = (select auth.uid())));

-- Contagem pública de curtidas (sem identificar quem curtiu).
create or replace function public.post_like_counts(p_posts uuid[])
returns table (post_id uuid, n integer) language sql stable security definer set search_path = public as $$
  select l.post_id, count(*)::integer from public.post_likes l
   where cardinality(p_posts) <= 200 and l.post_id = any (p_posts) group by l.post_id;
$$;
revoke all on function public.post_like_counts(uuid[]) from public;
grant execute on function public.post_like_counts(uuid[]) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.peer_info(p_other uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, is_house boolean, online boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, coalesce(nullif(p.display_name, ''), 'Usuário'), p.avatar_url,
         (p.account_type::text = 'casa'),
         coalesce(p.last_seen_at > now() - interval '35 seconds', false)
  from public.profiles p
  where p.id = p_other and auth.uid() is not null
    and (p.account_type::text = 'casa' or public.can_view_profile(p.id));
$function$;

-- FIM DO PASSO 17
