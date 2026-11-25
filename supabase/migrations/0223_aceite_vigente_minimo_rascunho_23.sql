-- 0223 — Sobe o mínimo do aceite para a versão 2026-11-rascunho-23 (mesmo valor de DOC_MIN_VERSION no app; um teste confere).
-- Aplicar JUNTO com a publicação do app que traz a tela de novo aceite: quem aceitou versão anterior precisa aceitar de novo
-- (a tela pede; o servidor também recusa compra e venda até lá).
insert into public.legal_min_version (doc_key, min_version)
values ('termos_cliente', '2026-11-rascunho-23'), ('termos_casa', '2026-11-rascunho-23')
on conflict (doc_key) do update set min_version = excluded.min_version, updated_at = now();
