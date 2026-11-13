-- PASSO 175: 0101_cancelamento_e_tela_unica — parte 1 de 13
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0101 — Cancelamento da assinatura pela casa e tela única de conta bloqueada/inativa.
-- Decisões do proprietário (13/11/2026): a casa cancela quando quiser, escolhendo "usar até o vencimento" (no dia a casa fica inativa e não é
-- cobrada de novo; até lá pode desfazer) ou "cancelar agora" (inativa na hora, sem devolução; dentro dos 7 dias do primeiro pagamento vale o reembolso).
-- Cancelar não apaga dívida: com fatura em atraso o cancelamento é recusado. Bloqueio total e conta inativa levam a uma tela única (no app); aqui
-- ficam o estado da conta e a trava no servidor: casa em bloqueio total não grava mais nada de casa (posts, serviços, campanhas, equipe etc.).

-- ============ 1) cancelamento agendado ============
alter table public.house_billing_state add column if not exists cancel_at date;

alter table public.house_billing_state add column if not exists cancel_requested_at timestamptz;

alter table public.house_billing_state add column if not exists cancel_charges uuid[] not null default '{}';
