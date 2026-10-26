-- Gerenciamento de administradores pelo painel (adicionar/remover por e-mail), com histórico.

create or replace function public.admin_list_admins() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'created_at', a.created_at) order by a.created_at)
      from public.admins a join auth.users u on u.id = a.user_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_add_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'user_not_found'; end if;
  insert into public.admins (user_id) values (v_id) on conflict do nothing;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'admins', null, jsonb_build_object('added', v_id, 'email', lower(trim(p_email))));
end $$;

create or replace function public.admin_remove_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if (select count(*) from public.admins) <= 1 then raise exception 'last_admin'; end if;
  delete from public.admins where user_id = p_user_id;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'admins', jsonb_build_object('removed', p_user_id), jsonb_build_object('removed', p_user_id));
end $$;

revoke execute on function public.admin_list_admins() from public, anon;
revoke execute on function public.admin_add_admin(text) from public, anon;
revoke execute on function public.admin_remove_admin(uuid) from public, anon;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_add_admin(text) to authenticated;
grant execute on function public.admin_remove_admin(uuid) to authenticated;
