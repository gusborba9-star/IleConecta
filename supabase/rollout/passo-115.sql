-- PASSO 115: 0094_cobranca_automatica_cartao — parte 1 de 14
-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.
-- Fase 4: cobrança automática do cartão salvo (mensalidade do plano e vagas extras de equipe).
-- Regras do proprietário (2026-11-13): cobra no dia do vencimento; se recusar, até 3 tentativas em dias seguidos (vencimento, +1, +2);
-- depois disso a fatura segue o fluxo normal (tolerância, suspensão parcial, bloqueio total) e a casa recebe aviso para pagar ou trocar o cartão;
-- aviso 3 dias antes ("será cobrada no cartão final XXXX") e 1 dia antes; a casa liga, desliga, troca e remove o cartão quando quiser.
-- Só vale para casas que ativaram: a cobrança automática nunca é ligada por outra pessoa, e só alcança faturas com vencimento a partir do dia da ativação.
-- O dinheiro entra pelo mesmo caminho do pagamento manual (platform_charge_confirm), então livro-razão, tarifa e duplicidade seguem as mesmas regras.
-- Estado de produção antes desta migration: nenhuma casa tem cartão guardado; existem só a fatura de teste da casa de teste e o pacote de créditos abandonado.
-- O Stripe é o único provedor hoje; o cartão guarda o id do provedor e os dados só ficam no servidor (nada disso é legível pelo navegador).

-- ============ 1) regra fixa: no máximo 3 tentativas por fatura ============
create or replace function public.billing_auto_max_attempts() returns int
language sql immutable set search_path = public as $$ select 3 $$;

-- a função só liga para quem o painel liberou: "card_recurring" nos meios do plano ou das vagas extras
create or replace function public.billing_auto_card_enabled() returns boolean
language sql stable security definer set search_path = public as $$
select coalesce((public.platform_billing_config() ->> 'enabled')::boolean, false)
and (coalesce(public.platform_billing_config() -> 'methods' -> 'plan', '[]'::jsonb) ? 'card_recurring'
or coalesce(public.platform_billing_config() -> 'methods' -> 'extra_seat', '[]'::jsonb) ? 'card_recurring');
$$;
