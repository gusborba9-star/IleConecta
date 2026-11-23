-- 0185 — Palavra de segurança (Blueprint §18, "Troca de e-mail e recuperação de acesso").
-- Passo 2 de 3: só a palavra de segurança. A palavra nunca é guardada nem devolvida: só o código irreversível (bcrypt).
-- Pode rodar de novo sem problema.

create extension if not exists pgcrypto with schema extensions;

-- Normaliza: minúsculas, sem acento, sem espaços sobrando. "  Água  Viva " e "agua viva" viram a mesma palavra.
create or replace function public.recovery_norm_word(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;

-- A própria pessoa define ou troca a palavra (precisa estar logada).
create or replace function public.set_security_word(p_word text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_norm text := public.recovery_norm_word(p_word);
begin
  if v_uid is null then raise exception 'Faça login para continuar.' using errcode = '28000'; end if;
  if char_length(v_norm) < 4 or char_length(v_norm) > 60 then
    raise exception 'A palavra de segurança precisa ter de 4 a 60 caracteres.' using errcode = '22023';
  end if;
  insert into public.account_security_words (user_id, word_hash, set_at)
  values (v_uid, extensions.crypt(v_norm, extensions.gen_salt('bf', 10)), now())
  on conflict (user_id) do update set word_hash = excluded.word_hash, set_at = now();
end $$;

-- Só diz se existe (nunca o conteúdo).
create or replace function public.has_security_word()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_security_words where user_id = auth.uid())
$$;

-- Uso interno do servidor (função de recuperação): confere sem revelar nada.
-- Devolve: ok | wrong | none_set | not_answered
create or replace function public.check_security_word(p_user uuid, p_word text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_norm text := public.recovery_norm_word(p_word);
begin
  select word_hash into v_hash from public.account_security_words where user_id = p_user;
  if v_hash is null then return 'none_set'; end if;
  if v_norm = '' or v_norm = 'nao lembro' or v_norm = 'nao_lembro' then return 'not_answered'; end if;
  if char_length(v_norm) > 60 then return 'wrong'; end if;
  return case when extensions.crypt(v_norm, v_hash) = v_hash then 'ok' else 'wrong' end;
end $$;

revoke all on function public.recovery_norm_word(text) from public, anon, authenticated;
revoke all on function public.set_security_word(text) from public, anon;
revoke all on function public.has_security_word() from public, anon;
revoke all on function public.check_security_word(uuid, text) from public, anon, authenticated;
grant execute on function public.recovery_norm_word(text) to service_role;
grant execute on function public.set_security_word(text) to authenticated;
grant execute on function public.has_security_word() to authenticated;
grant execute on function public.check_security_word(uuid, text) to service_role;
