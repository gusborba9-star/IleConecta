-- PASSO 25 de 25: 0070 b: F9 — revoga TRUNCATE, REFERENCES, TRIGGER e MAINTAIN de anon e authenticated
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

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
