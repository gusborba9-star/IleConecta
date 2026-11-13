-- PASSO 165: 0100_reajuste_tabela_comercial — parte 1 de 10
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- 0100 — Atualização da tabela comercial (reajuste de mensalidade) com aviso de 30 dias.
-- Decisão do proprietário e do jurídico (2026-11-13): sem índice; "atualização da tabela comercial"; aviso à casa com no mínimo 30 dias de antecedência da renovação.
-- Como funciona: o administrador ANUNCIA o novo valor de um plano; a vigência é, no mínimo, 30 dias depois do anúncio (ou uma data posterior, se ele quiser).
-- Cada casa muda na SUA primeira renovação (dia de cobrança dela) que cair na vigência ou depois: quem vence antes disso pula o reajuste e só sente 1 ciclo depois.
-- A notificação já diz a data da renovação de cada casa. As casas matriculadas naquele plano recebem
-- notificação (com registro de leitura e push). A fatura de uma renovação com vencimento NA data de vigência ou depois dela sai com o valor novo; antes disso, o valor antigo.
-- Na data, a tabela de preços do painel passa a ter o valor novo (para novas contratações e reativações). Redução de preço vale na hora (é favorável à casa).
-- Aumento direto na tabela (sem anunciar) é recusado enquanto a cobrança da plataforma estiver ligada.
-- Estado de produção antes desta migration: nenhum reajuste anunciado.

-- ============ 1) reajustes anunciados ============
create table if not exists public.platform_price_changes (
id uuid primary key default gen_random_uuid(),
plan text not null check (plan in ('base', 'intermediario', 'maximo')),
old_cents bigint not null check (old_cents between 100 and 5000000),
new_cents bigint not null check (new_cents between 100 and 5000000 and new_cents > old_cents),
announced_on date not null,
effective_on date not null,
status text not null default 'anunciado' check (status in ('anunciado', 'aplicado', 'cancelado')),
reason text check (reason is null or char_length(reason) <= 300),
announced_by uuid,
notified integer not null default 0,
created_at timestamptz not null default now(),
applied_at timestamptz,
check (effective_on >= announced_on + 30)
);
