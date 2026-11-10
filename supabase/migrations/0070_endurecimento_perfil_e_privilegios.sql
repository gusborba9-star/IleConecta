-- 0070 — F8 e F9 da auditoria 31.3.
-- F8: o cliente não troca o próprio tipo de conta ("account_type") pela API. O tipo nasce no cadastro (gatilho handle_new_user)
--     e nenhum fluxo do app o altera depois. A troca só vale para o banco (SQL Editor, service_role, funções de manutenção).
-- F9: visitante (anon) e usuário logado (authenticated) perdem TRUNCATE, REFERENCES, TRIGGER e MAINTAIN em todas as tabelas de public
--     (a RLS não cobre esses privilégios e a API do app não os usa). Vale também para as tabelas criadas daqui para frente.
-- Idempotente. Não altera dados.

-- ============ F8 ============
create or replace function public.profiles_guard_account_type()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.account_type is distinct from old.account_type and current_user in ('anon', 'authenticated') then
    raise exception 'O tipo da conta não pode ser alterado.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.profiles_guard_account_type() from public, anon, authenticated;
drop trigger if exists trg_profiles_guard_account_type on public.profiles;
create trigger trg_profiles_guard_account_type before update on public.profiles
  for each row execute function public.profiles_guard_account_type();

-- ============ F9 ============
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
do $$
begin
  execute 'revoke maintain on all tables in schema public from anon, authenticated';
exception when others then
  raise notice 'MAINTAIN não existe nesta versão do PostgreSQL: nada a revogar';
end $$;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
exception when others then
  raise notice 'MAINTAIN não existe nesta versão do PostgreSQL: nada a revogar nos privilégios padrão';
end $$;
