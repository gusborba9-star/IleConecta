# Marketplace Payments (Stripe) × Platform Billing (Efí) — contratos e pontos de integração

- Status: **recomendação técnica subordinada**. Não altera o Blueprint nem o Roadmap; alterações normativas dependem de validação do CTO.
- Origem: diretriz arquitetural CTO (Stripe = marketplace; Efí = monetização própria) e EXEC-01 (PR #140).
- Escopo desta entrega: **somente análise e contratos**. Nenhuma integração Efí, credencial, cobrança ou configuração externa foi criada.

## 1. Domínios

| Domínio | Provedor | Dinheiro de quem | Exemplos |
|---|---|---|---|
| Marketplace Payments | Stripe Connect (cobrança direta) | cliente → casa (a plataforma recebe só a comissão, `application_fee`) | reservas de ritual, serviços, mensalidades pagas pela plataforma |
| Platform Billing | Efí | casa/usuário → plataforma (receita própria) | planos, impulsionamentos (`boosts`), destaques, recursos adicionais |

A comissão (15% rituais / 4% serviços e mensalidades) continua sendo **parte da transação do marketplace** (linha `plataforma` do ledger do marketplace). Ela não é cobrança do Platform Billing e não deve ser duplicada lá. A visão consolidada de receita é um **relatório que lê os dois domínios**, nunca uma tabela compartilhada.

## 2. Estado atual (verificado no código, EXEC-01)

- O núcleo financeiro (`supabase/functions/payments/`) já está desacoplado do Stripe por contrato (`provider.js`), com um único adaptador (`stripeAdapter.js`).
- O contrato atual é **de marketplace** (`account`, `application_fee`, `refund_application_fee`, `fetchFees` na conta conectada). Ele não deve ser implementado pela Efí.
- Tabelas do marketplace: `payments` (liga a `reservations`, `service_orders`, `member_dues`), `ledger_entries` (sempre com `house_id`), `stripe_events`, `refund_requests`.
- Produtos de receita própria hoje **não passam por `payments`**: `boosts.paid` e `houses.plan` existem e são marcados "somente pelo backend", mas não há fluxo de cobrança ligado a eles. Logo, não há acoplamento a desfazer; há um espaço limpo para o Platform Billing.
- Pontos que **precisam continuar separados** (risco de acoplamento indevido):
  1. flag `features.payments` (liga/desliga o marketplace) — o Platform Billing precisa de flag própria;
  2. a Edge Function `payments`, seu segredo de webhook e sua rotina (`x-cron-secret`) — o Platform Billing precisa de função, segredo e rotina próprios;
  3. `ledger_entries` (tipos `bruto/casa/plataforma/taxa_provedor`, sempre por casa) — receita própria usa outro ledger;
  4. `stripe_events` (eventos do Stripe) — a Efí usa tabela de eventos própria.

## 3. Contrato recomendado do Platform Billing (execução futura específica)

Não reutilizar `PROVIDER_METHODS`. Contrato próprio, sem conta conectada nem repasse:

```
createCharge({ billingId, payerId, kind, amountCents, description, dueAt, idempotencyKey }) -> { ref, method, qrOrLink?, expiresAt }
getCharge({ ref })                                  -> { ref, status, paidAt?, paidAmountCents? }
cancelCharge({ ref })                               -> { status }
refund({ ref, amountCents?, idempotencyKey })       -> { refundRef, status }   // quando o produto permitir
verifyWebhook(rawBody, headers)                     -> boolean
parseEvent(event)                                   -> { id, kind, ref, billingId?, paidAmountCents? }
fetchFees({ ref })                                  -> { feeCents } | null     // null = desconhecida, nunca zero
```

Dados (independentes, prefixo `platform_`):

- `platform_charges` (cobrança): produto (`plan|boost|destaque|addon`), referência ao beneficiário (casa/publicação), valor, provedor, `provider_ref`, estado, regra comercial versionada, `idempotency_key` único.
- `platform_billing_events` (avisos do provedor, com lease e rejeição como em `stripe_events`).
- `platform_ledger_entries` (receita própria, tarifa do provedor, estornos). **Sem** `house_id` obrigatório de recebimento, **sem** linhas `casa`/`plataforma`.
- Liberação do produto (`houses.plan`, `boosts.paid`) apenas por função de banco chamada após confirmação do provedor, com o mesmo padrão `identity` (provedor + referência + valor esperado).

Regras herdadas do que a EXEC-01 provou útil: confirmação financeira atômica no banco; tarifa conciliada à parte e **nunca gravada como zero sem evidência**; lease com dono no processamento de webhook; idempotência por chave; compare-and-set ao gravar a referência da cobrança; evento divergente rejeitado e visível; detecção por consulta somente leitura.

## 4. Pontos de integração (sem acoplamento)

- Frontend: novos módulos próprios (`platformBilling`), sem importar `src/lib/payments*`.
- Backend: Edge Function própria (`platform-billing`), com segredos próprios (credenciais e certificado da Efí; mTLS a validar na execução futura — **não verificado**), webhook próprio, rotina própria.
- Administração: telas de conciliação separadas por domínio; o consolidado soma duas fontes distintas.
- Falha isolada: cada função e cada flag liga/desliga o seu domínio; indisponibilidade da Efí não deve afetar reservas/serviços, e vice-versa.

## 5. Limites

- Esta recomendação não define preços, planos, regras de cancelamento nem tratamento fiscal de planos/impulsionamentos (decisões comerciais/jurídicas pendentes).
- Nenhuma conformidade da Efí (Pix, boleto, cartão, webhooks, mTLS) foi verificada; depende de execução futura com credenciais fornecidas pelo proprietário.

## Anexo — Pontos de verificação do Marketplace (EXEC-01, 2026-11-04)

- **Função implantada em produção (versão 18)** é anterior à EXEC-01: grava tarifa 0 quando o Stripe ainda não liberou a `balance_transaction` (causa do pagamento 435e) e cria nova sessão sempre que a anterior não está "aberta", inclusive quando já está paga (causa mais provável das duas cobranças do de60). A PR #140 corrige ambos; a correção só vale depois de migrations (0064–0066) e deploy autorizados.
- **Webhook de produção** (único endpoint) aponta para a função de produção. Na versão 18, um evento de pagamento desconhecido é gravado em `stripe_events` e ignorado; não confirma nem altera pagamento. Compras de teste feitas em outro banco continuariam chegando ao banco de produção como linhas de `stripe_events`.
- **Leitura somente leitura do Stripe**: objetos de cobrança direta ficam na conta conectada e não são visíveis do contexto da plataforma; a listagem de cobranças sem vínculo (lado Stripe) exige leitura na conta conectada e permanece como procedimento manual.
