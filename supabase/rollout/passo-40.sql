-- PASSO 40: 0076 — aceite: nova opção na tabela (retirada de dados sensíveis)
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.

-- 1) A tabela de aceites passa a aceitar o registro de retirada da autorização de dados sensíveis.
alter table public.legal_consents drop constraint if exists legal_consents_doc_key_check;
alter table public.legal_consents add constraint legal_consents_doc_key_check
  check (doc_key = any (array['termos_cliente','checkout_ritual','checkout_servico','dados_sensiveis','dados_sensiveis_retirada','termos_casa']));
