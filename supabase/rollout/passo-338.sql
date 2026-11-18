-- PASSO 338: 0163_momentos_curtir_comentar_ver — parte 2 de 3
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
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
