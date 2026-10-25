-- Cria perfil (e casa + assistente, quando account_type = 'casa') automaticamente no cadastro.
-- Os dados vêm de raw_user_meta_data enviados pelo signUp do app:
--   account_type: 'casa' | 'cliente'  | display_name | city | state | category
-- Roda como SECURITY DEFINER (ignora RLS) e só é chamada pelo gatilho em auth.users.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  acc_type text  := case when meta->>'account_type' = 'casa' then 'casa' else 'cliente' end;
  nm       text  := left(btrim(coalesce(nullif(meta->>'display_name', ''), split_part(new.email, '@', 1))), 80);
  base     text;
  new_slug text;
  hid      uuid;
begin
  if char_length(nm) < 2 then
    nm := 'Usuario';
  end if;

  insert into public.profiles (id, account_type, display_name, city, state, country)
  values (
    new.id,
    acc_type::account_type,
    nm,
    left(nullif(btrim(meta->>'city'), ''), 80),
    left(nullif(btrim(meta->>'state'), ''), 40),
    'BR'
  );

  if acc_type = 'casa' then
    base := lower(regexp_replace(
      translate(nm,
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
      '[^a-zA-Z0-9]+', '-', 'g'));
    base := btrim(left(base, 45), '-');
    if char_length(base) < 2 then
      base := 'casa';
    end if;
    new_slug := base || '-' || substr(replace(new.id::text, '-', ''), 1, 6);

    insert into public.houses (owner_id, name, slug, category)
    values (new.id, nm, new_slug, left(nullif(btrim(meta->>'category'), ''), 80))
    returning id into hid;

    insert into public.assistants (house_id) values (hid);
  end if;

  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
