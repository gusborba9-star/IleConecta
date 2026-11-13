-- PASSO 140: 0096_autorizacao_cobranca_automatica — parte 1 de 4
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Autorização de cobrança automática no cartão (exigência jurídica: consentimento específico, caixa desmarcada, com plano, valor e periodicidade).
-- 1) novo tipo de aceite; 2) registro imutável do que a casa viu e autorizou; 3) o servidor só abre o cadastro do cartão e só liga a cobrança
-- automática se houver uma autorização recente (60 minutos) da própria casa. Rode no SQL Editor. É seguro repetir.

-- ============ 1) novo tipo de aceite ============
alter table public.legal_consents drop constraint if exists legal_consents_doc_key_check;

alter table public.legal_consents add constraint legal_consents_doc_key_check
check (doc_key = any (array['termos_cliente', 'checkout_ritual', 'checkout_servico', 'dados_sensiveis', 'dados_sensiveis_retirada', 'termos_casa', 'cobranca_automatica']));

-- ============ 2) o que a casa viu e autorizou (só de acréscimo) ============
create table if not exists public.house_auto_authorizations (
id uuid primary key default gen_random_uuid(),
house_id uuid not null,
user_id uuid not null,
consent_id uuid not null references public.legal_consents(id) on delete restrict,
plan_key text check (plan_key is null or char_length(plan_key) between 1 and 40),
amount_cents bigint check (amount_cents is null or amount_cents >= 0),
period text not null check (period in ('mensal', 'trimestral', 'anual')),
text_shown text not null check (char_length(text_shown) between 20 and 1500),
created_at timestamptz not null default now()
);
