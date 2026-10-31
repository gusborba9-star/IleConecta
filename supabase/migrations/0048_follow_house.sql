-- Seguir casas. A tabela follows já existia (RLS ligada, sem políticas): todo acesso passa por funções,
-- e a casa vê apenas a contagem de seguidores, nunca quem segue.
create or replace function public.follow_house(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_house uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para seguir.'; end if;
  select id into v_house from houses where owner_id = p_owner;
  if v_house is null then raise exception 'Casa não encontrada.'; end if;
  if p_owner = auth.uid() then raise exception 'Você não pode seguir a própria casa.'; end if;
  insert into follows(follower_id, house_id) values (auth.uid(), v_house) on conflict do nothing;
end $$;

create or replace function public.unfollow_house(p_owner uuid) returns void language sql security definer set search_path = public as $$ delete from follows where follower_id = auth.uid() and house_id = (select id from houses where owner_id = p_owner); $$;

-- Contagem por casa (chave = id do dono) e as casas que a pessoa logada segue.
create or replace function public.house_follow_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(h.owner_id::text, c.n)
                        from (select house_id, count(*) n from follows group by house_id) c
                        join houses h on h.id = c.house_id), '{}'::jsonb),
    'mine', coalesce((select jsonb_agg(h.owner_id::text)
                      from follows f join houses h on h.id = f.house_id
                      where f.follower_id = auth.uid()), '[]'::jsonb)
  );
$$;

revoke all on function public.follow_house(uuid) from public, anon;
revoke all on function public.unfollow_house(uuid) from public, anon;
revoke all on function public.house_follow_summary() from public, anon;
grant execute on function public.follow_house(uuid) to authenticated;
grant execute on function public.unfollow_house(uuid) to authenticated;
grant execute on function public.house_follow_summary() to authenticated;
