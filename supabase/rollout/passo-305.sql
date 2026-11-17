-- PASSO 305: 0141_avisos_de_curtida_comentario_seguidor — parte 2 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 6) comentário
create or replace function public.notify_post_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_name text;
begin
  select h.owner_id into v_owner from public.posts p join public.houses h on h.id = p.house_id where p.id = new.post_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  if not coalesce((select np.notify_comments from public.notification_prefs np where np.user_id = v_owner), true) then return new; end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = new.user_id) then return new; end if;
  v_name := coalesce(public.social_actor_name(new.user_id), 'Alguém');
  insert into public.notifications (user_id, text, href, kind, ref_id, actor_id, grouped)
  values (v_owner, v_name || ' comentou na sua publicação.', '/comunidade?post=' || new.post_id::text, 'comment', new.post_id, new.user_id, 1)
  on conflict (user_id, ref_id, actor_id) where kind = 'comment' and read = false
  do update set grouped = public.notifications.grouped + 1,
                text = v_name || ' comentou ' || (public.notifications.grouped + 1)::text || ' vezes na sua publicação.', created_at = now();
  return new;
exception when others then
  return new;
end $$;

revoke execute on function public.notify_post_comment() from public, anon, authenticated;

drop trigger if exists trg_notify_post_comment on public.post_comments;

create trigger trg_notify_post_comment after insert on public.post_comments for each row execute function public.notify_post_comment();

-- 7) novo seguidor
create or replace function public.notify_new_follower() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_new int;
begin
  select h.owner_id into v_owner from public.houses h where h.id = new.house_id;
  if v_owner is null or v_owner = new.follower_id then return new; end if;
  if not coalesce((select np.notify_follows from public.notification_prefs np where np.user_id = v_owner), true) then return new; end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = new.follower_id) then return new; end if;
  insert into public.social_notice_log (kind, actor_id, ref_id) values ('follow', new.follower_id, new.house_id) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then return new; end if;
  insert into public.notifications (user_id, text, href, kind, ref_id, actor_id, grouped)
  values (v_owner, coalesce(public.social_actor_name(new.follower_id), 'Alguém') || ' começou a seguir você.', '/pessoas', 'follow', new.house_id, new.follower_id, 1);
  return new;
exception when others then
  return new;
end $$;

revoke execute on function public.notify_new_follower() from public, anon, authenticated;

drop trigger if exists trg_notify_new_follower on public.follows;

create trigger trg_notify_new_follower after insert on public.follows for each row execute function public.notify_new_follower();
