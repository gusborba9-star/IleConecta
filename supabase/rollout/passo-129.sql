-- PASSO 129: 0095_reembolso_creditos_7_dias — parte 1 de 11
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: reembolso de créditos de IA em até 7 dias (decisão do proprietário, 2026-11-13, conforme orientação jurídica: direito de arrependimento do CDC).
-- Regras: dentro de 7 dias do pagamento a casa pode pedir o reembolso do pacote. Devolve-se o valor proporcional às respostas que AINDA NÃO foram usadas do pacote,
-- pelo preço pago (franquia do mês é gasta primeiro, então só o que saiu do pacote conta como usado). Nada usado = valor integral. A tarifa do provedor NÃO é descontada (a plataforma absorve).
-- Exemplo: pacote de 200 por R$ 49,90, 30 usadas, 170 restantes: 170 x R$ 0,2495 = R$ 42,415, arredondado para R$ 42,42 (meio centavo arredonda para cima, em favor da casa).
-- O saldo restante é retirado antes de pedir o estorno ao provedor (não dá para gastar enquanto devolve); se o provedor recusar de forma definitiva, o saldo volta.
-- Estorno total vira fatura 'estornada'; parcial mantém a fatura 'paga' e registra o estorno no livro-razão (que nunca é alterado nem apagado).
-- Estado de produção antes desta migration: existem só pacotes de teste da casa de teste; nenhum reembolso existe.

-- ============ 1) reembolsos de pacote ============
create table if not exists public.platform_credit_refunds (
id uuid primary key default gen_random_uuid(),
charge_id uuid not null references public.platform_charges(id) on delete restrict,
house_id uuid not null,
pack_id uuid not null references public.ai_credit_packs(id) on delete restrict,
credits int not null check (credits > 0),
amount_cents bigint not null check (amount_cents > 0),
status text not null default 'pendente' check (status in ('pendente', 'concluido', 'falhou')),
provider text,
provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
error text check (error is null or char_length(error) <= 300),
requested_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
done_at timestamptz
);
