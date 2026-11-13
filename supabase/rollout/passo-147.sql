-- PASSO 147: 0098_reembolso_plano_7_dias — parte 1 de 12
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: reembolso do primeiro pagamento do plano em até 7 dias (decisão do proprietário, 2026-11-13, conforme orientação jurídica: direito de arrependimento).
-- Regras: só o PRIMEIRO pagamento de plano da casa, dentro de 7 dias do pagamento, uma única vez por casa. Devolve o valor integral pago (a plataforma absorve a tarifa).
-- Ao concluir o estorno: a fatura vira 'estornada', a cobrança mensal para (a casa sai da matrícula), faturas abertas do plano e de vagas extras são canceladas,
-- a cobrança automática do cartão desliga e a casa fica INATIVA (bloqueio total já existente: fora da descoberta e do feed, painel só leitura; dados guardados).
-- A reativação é feita pelo suporte (admin_billing_reactivate + matrícula). Créditos de IA têm reembolso próprio e não entram aqui.
-- Estado de produção antes desta migration: nenhum reembolso de plano existe.

-- ============ 1) casa cancelada por reembolso: o estado de bloqueio passa a lembrar disso ============
alter table public.house_billing_state add column if not exists cancelled_at timestamptz;
