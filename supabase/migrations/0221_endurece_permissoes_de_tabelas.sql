-- 0221 — Defesa em profundidade nas permissões das tabelas (achado da auditoria de 24/11/2026).
-- Situação: por herança do começo do projeto, o papel anônimo (visitante sem login) tinha permissão de escrever (insert/update/delete)
-- em 40 tabelas do esquema public, e o papel autenticado em legal_consents (prova dos aceites). Nada disso era explorável, porque
-- a segurança por linha (RLS) bloqueava (nenhuma política de escrita para esses papéis), mas uma política errada no futuro abriria a porta.
-- Agora a permissão também é retirada: visitante nunca escreve direto (só pelas funções RPC liberadas, que continuam iguais);
-- legal_consents só é gravada pela função record_consent (security definer). Novas tabelas também nascem sem escrita para o anônimo.
-- Seguro repetir. Não muda nenhuma função nem política.

do $$
declare t record;
begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon', t.relname);
  end loop;
end $$;

revoke all on table public.legal_consents from anon;
revoke insert, update, delete, truncate, references, trigger on table public.legal_consents from authenticated;

alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
