-- PASSO 298: 0138_modulos_de_acesso_da_administracao — parte 1 de 2
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0138 — Módulos de acesso da administração (base). Só o DONO tem poder sobre tudo; os demais administradores recebem módulos.
-- Módulos: suporte (atender chamados), moderacao (verificar infrações), comunicacao (comunicados e contato),
-- indicadores (ver números, só leitura), contas (suspender e reativar contas). Tudo o mais é só do dono.
-- is_admin() continua significando "pertence à administração" (nada que já existe quebra); a decisão fina é admin_can(módulo).
-- A aplicação das travas por módulo nas funções existentes vem na 0139.

alter table public.admins add column if not exists is_owner boolean not null default false;

alter table public.admins add column if not exists perms text[] not null default '{}';

-- Hoje todas as contas administradoras têm poder total: na primeira aplicação, elas viram dono (em produção há uma só).
update public.admins set is_owner = true where not exists (select 1 from public.admins a2 where a2.is_owner);

alter table public.admins drop constraint if exists admins_perms_ok;

alter table public.admins add constraint admins_perms_ok
  check (perms <@ array['suporte','moderacao','comunicacao','indicadores','contas']::text[]);

create unique index if not exists admins_one_owner on public.admins ((true)) where is_owner;

create or replace function public.admin_can(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select a.is_owner or (p_module <> 'dono' and p_module = any (a.perms))
      from public.admins a where a.user_id = (select auth.uid())
  ), false);
$$;

revoke execute on function public.admin_can(text) from public, anon, authenticated;

grant execute on function public.admin_can(text) to authenticated;

create or replace function public.admin_my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('admin', true, 'owner', a.is_owner, 'perms', to_jsonb(a.perms))
                     from public.admins a where a.user_id = (select auth.uid())),
                  jsonb_build_object('admin', false, 'owner', false, 'perms', '[]'::jsonb));
$$;

revoke execute on function public.admin_my_access() from public, anon, authenticated;

grant execute on function public.admin_my_access() to authenticated;

create or replace function public.admin_list_admins() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'name', p.display_name, 'owner', a.is_owner,
             'perms', to_jsonb(a.perms), 'created_at', a.created_at) order by a.is_owner desc, a.created_at)
      from public.admins a join auth.users u on u.id = a.user_id left join public.profiles p on p.id = a.user_id
  ), '[]'::jsonb);
end $$;

drop function if exists public.admin_add_admin(text);

create or replace function public.admin_add_admin(p_email text, p_perms text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_perms text[] := coalesce(p_perms, '{}');
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if not (v_perms <@ array['suporte','moderacao','comunicacao','indicadores','contas']::text[]) then raise exception 'modulo_invalido'; end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.admins where user_id = v_id and is_owner) then raise exception 'dono_nao_muda'; end if;
  insert into public.admins (user_id, perms) values (v_id, v_perms)
    on conflict (user_id) do update set perms = excluded.perms;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'admins', null, jsonb_build_object('added', v_id, 'perms', to_jsonb(v_perms)));
end $$;

create or replace function public.admin_set_admin_perms(p_user uuid, p_perms text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_perms text[] := coalesce(p_perms, '{}'); v_old text[];
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if not (v_perms <@ array['suporte','moderacao','comunicacao','indicadores','contas']::text[]) then raise exception 'modulo_invalido'; end if;
  select perms into v_old from public.admins where user_id = p_user and not is_owner for update;
  if not found then raise exception 'admin_inexistente'; end if;
  update public.admins set perms = v_perms where user_id = p_user;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'admins', jsonb_build_object('user', p_user, 'perms', to_jsonb(v_old)), jsonb_build_object('user', p_user, 'perms', to_jsonb(v_perms)));
end $$;

create or replace function public.admin_remove_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_can('dono') then raise exception 'not_admin' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where user_id = p_user_id and is_owner) then raise exception 'dono_nao_removivel'; end if;
  delete from public.admins where user_id = p_user_id;
  insert into public.admin_audit (admin_id, key, old_value, new_value)
    values (auth.uid(), 'admins', jsonb_build_object('removed', p_user_id), jsonb_build_object('removed', p_user_id));
end $$;

revoke execute on function public.admin_list_admins() from public, anon, authenticated;

revoke execute on function public.admin_add_admin(text, text[]) from public, anon, authenticated;

revoke execute on function public.admin_set_admin_perms(uuid, text[]) from public, anon, authenticated;

revoke execute on function public.admin_remove_admin(uuid) from public, anon, authenticated;
