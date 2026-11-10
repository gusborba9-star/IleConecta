-- Reversão da 0070. F8: remove o gatilho que trava o tipo de conta. F9: devolve os privilégios amplos (NÃO recomendado; só para voltar ao estado anterior).
drop trigger if exists trg_profiles_guard_account_type on public.profiles;
drop function if exists public.profiles_guard_account_type();
grant truncate, references, trigger on all tables in schema public to anon, authenticated;
alter default privileges for role postgres in schema public grant truncate, references, trigger on tables to anon, authenticated;
do $$ begin execute 'grant maintain on all tables in schema public to anon, authenticated'; execute 'alter default privileges for role postgres in schema public grant maintain on tables to anon, authenticated'; exception when others then null; end $$;
