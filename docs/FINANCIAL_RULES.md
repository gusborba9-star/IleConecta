# Ilê Conecta — Regras financeiras e ciclo de repasse

> **Autoridade:** decisão explícita do CTO na ordem DOC-03.  
> **Estado:** ESPECIFICAÇÃO FINANCEIRA APROVADA; implementação, integração e validação operacional PENDENTES.  
> **Escopo:** regras de negócio e arquitetura proposta. Não representa integração Asaas concluída, saldo real, escrow contratado ou capacidade já comprovada do provedor.

## 1. Regras financeiras obrigatórias

| ID | Regra aprovada | Estado |
|---|---|---|
| FIN-D03-01 | Comissão da plataforma: 17% do valor bruto de cada transação elegível. | APROVADO-CTO |
| FIN-D03-02 | Direito bruto da casa religiosa: 83% do valor bruto da transação. | APROVADO-CTO |
| FIN-D03-03 | Taxas do provedor de pagamento são despesa integral da plataforma e não reduzem o direito bruto de 83% da casa. | APROVADO-CTO |
| FIN-D03-04 | Reserva financeira de 2% permanece dentro da parcela de 17% da plataforma; não é cobrança adicional. Finalidade, saldo, movimentações e liberações devem ser auditáveis. | APROVADO-CTO |
| FIN-D03-05 | Valores monetários são calculados e persistidos em centavos inteiros; política de arredondamento deve ser explícita, consistente e testada. | APROVADO-CTO |
| FIN-D03-06 | Ledger deve registrar bruto, comissão, direito da casa, taxas do provedor, reembolsos, ajustes, saldo retido, saldo elegível e repasses. | APROVADO-CTO |
| FIN-D03-07 | Retenção de segurança: 72 horas após o encerramento efetivo do evento, com horário calculado em `America/Sao_Paulo`. | APROVADO-CTO |
| FIN-D03-08 | Só liberar valor elegível após a retenção, conferência de reembolsos/contestações e confirmação de saldo real disponível. | APROVADO-CTO |
| FIN-D03-09 | Contestação pendente bloqueia o valor afetado até resolução. | APROVADO-CTO |
| FIN-D03-10 | Cada repasse registra identificador, valor, destinatário, data, estado e evidência de confirmação do provedor. | APROVADO-CTO |
| FIN-D03-11 | Asaas é o provedor prioritário para avaliação; adequação ao fluxo depende de documentação oficial, contrato e testes Sandbox. | PRIORIDADE APROVADA; CAPACIDADE NÃO COMPROVADA |

A distribuição incide sobre o valor bruto da transação, antes de descontar taxa do provedor. Exemplo: em R$ 100,00, comissão da plataforma = R$ 17,00 e direito bruto da casa = R$ 83,00. Se o provedor cobrar R$ 3,00, os R$ 3,00 são despesa da plataforma; o direito da casa continua R$ 83,00, antes de ajustes legítimos de reembolso/contestação previstos na política aplicável.

### 1.1 Reserva interna de 2%

Os 2% são uma alocação interna dentro dos 17% da plataforma, nunca uma terceira parcela. A ordem DOC-03 não define de modo suficiente se a base é 2% do valor bruto ou 2% da comissão de 17%; não fixar silenciosamente essa base. Antes da implementação, registrar ADR/decisão complementar que especifique base exata, finalidade, titularidade contábil, conta/ledger, regras de uso e liberação. Em qualquer interpretação, a casa não pode ter seu direito bruto de 83% reduzido por essa reserva.

### 1.2 Centavos e arredondamento

**Regra determinística:** `casa_centavos = round_half_up(bruto_centavos × 83 / 100)`; `plataforma_centavos = bruto_centavos − casa_centavos`. O arredondamento half-up é aplicado à parcela da casa e a comissão é o restante, evitando criar/perder centavos e evitando que o arredondamento reduza o direito da casa.

- Usar inteiros em centavos em persistência, APIs internas e ledger; nunca usar ponto flutuante binário para dinheiro.
- Registrar moeda e valores de origem; converter reais para centavos na fronteira de entrada usando parser decimal determinístico.
- Calcular a parcela da casa como arredondamento half-up de bruto_em_centavos × 83 / 100 para o centavo inteiro mais próximo. Calcular a comissão da plataforma como bruto_em_centavos − parcela_da_casa; assim, a soma é sempre exatamente igual ao bruto e o arredondamento protege a parcela da casa. A comissão é a parcela complementar do split percentual 17%/83% para o valor indivisível em centavos. Versionar esta regra e cobri-la com testes.
- Persistir a versão da regra financeira aplicada em cada transação para preservar histórico.
- Testar valores de R$ 0,01, valores ímpares em centavos, valores altos dentro dos limites aprovados, reembolsos parciais e múltiplas operações repetidas.

## 2. Ciclo financeiro e retenção

1. A confirmação autenticada do pagamento, após validar referência, valor, moeda e estado no provedor, registra de forma idempotente a transação e suas parcelas no ledger.
2. O valor bruto devido à casa permanece reservado e indisponível para repasse.
3. O instante de elegibilidade é **encerramento efetivo do evento + 72 horas**, calculado e persistido com fuso `America/Sao_Paulo`; conservar também timestamp UTC para auditoria. Não contar 72 horas a partir do pagamento.
4. Antes de liberar, recalcular saldo devido, reembolsos, ajustes, contestações, retenções e saldo real disponível. Elegibilidade temporal não equivale a autorização automática para transferir.
5. Contestação pendente bloqueia o valor afetado. Se o valor afetado não puder ser isolado com segurança, bloquear a parcela inteira da transação até revisão.
6. Criar ordem de repasse idempotente com identificador próprio, destinatário validado, valor, timestamps, estado e referência do provedor. Marcar como concluído somente após confirmação verificável do provedor; timeout/estado desconhecido permanece pendente e vai para reconciliação.
7. Notificar a casa sobre pagamento confirmado, reembolso, contestação, bloqueio, repasse pendente/concluído/falhou e ajustes relevantes.

## 3. Reembolsos, contestações e exceções

| Caso | Tratamento obrigatório |
|---|---|
| Reembolso integral antes do repasse | Registrar solicitação e resultado do provedor; bloquear repasse; reverter/ajustar os lançamentos de forma auditável e idempotente. |
| Reembolso parcial antes do repasse | Registrar valor solicitado e confirmado; recalcular obrigação e saldo elegível conforme política versionada; manter trilha do bruto original e ajustes. |
| Reembolso solicitado durante a retenção | Bloquear o valor afetado enquanto a solicitação estiver pendente; não liberar apenas porque as 72 horas venceram. |
| Contestação/chargeback pendente | Bloquear o valor afetado, registrar evidência, prazo, estado e notificações; liberar somente após resolução e reconciliação. |
| Reembolso solicitado após repasse | Não presumir que o provedor possa retirar automaticamente o dinheiro já transferido. Abrir caso de recuperação, registrar responsável/valor/prazo e aplicar somente procedimento contratual e legalmente permitido. |
| Operação falha ou com timeout | Estado permanece pendente/desconhecido até consulta/reconciliação; não assumir sucesso nem disparar repetição não idempotente. |
| Evento/webhook duplicado | Deduplicar por identificador externo e chave idempotente; reprocessamento não pode duplicar cobrança, reembolso, ledger ou repasse. |
| Taxa do provedor não recuperada no reembolso | Registrar a taxa efetivamente cobrada/não recuperada como despesa da plataforma, salvo decisão posterior expressa e legalmente validada; não descontar automaticamente do direito da casa. |
| Saldo insuficiente para estorno/recuperação | Não inventar saldo nem efetuar transferência negativa. Marcar exceção, bloquear valores elegíveis quando apropriado, alertar operação e casa e exigir resolução/reconciliação documentada. |
| Divergência entre ledger e provedor | Suspender o movimento afetado, reconciliar com estado oficial do provedor e registrar ajuste com motivo e autor. |

A política final de responsabilidade econômica por cancelamentos, fraude, chargebacks, eventos não realizados e recuperação após repasse depende de revisão jurídica/contábil e decisão específica. Não presumir que a plataforma possa debitar saldo futuro da casa sem base contratual/legal e mecanismo comprovado.

## 4. Conceitos que não podem ser confundidos

- **Split:** instrução de distribuição de uma transação pelo provedor segundo as regras do produto contratado. Não comprova por si só retenção pós-evento, disponibilidade real nem garantia de 83% bruto para a casa.
- **Escrow/conta de garantia:** estrutura jurídica/financeira específica de custódia; não chamar um saldo bloqueado de escrow sem confirmação contratual e regulatória.
- **Saldo disponível:** montante que o provedor informa como disponível para movimentação no momento da consulta; não é sinônimo do valor contábil devido à casa.
- **Transferência/repasse:** ordem de movimentação de saldo para destinatário. Solicitação enviada não significa transferência concluída.
- **Reembolso:** operação de devolução da cobrança, sujeita ao estado da transação, saldo e recursos reais do provedor; não garante recuperação de taxa ou de valor previamente transferido.
- **Ledger interno:** registro contábil/auditável de direitos, despesas, bloqueios e movimentos; não substitui o saldo oficial do provedor nem cria dinheiro.

O split percentual padrão só poderá ser considerado adequado depois de provar, em documentação oficial e Sandbox, a base de cálculo bruta, a absorção das taxas pela plataforma, o comportamento de reembolsos/chargebacks e a compatibilidade com a retenção de 72 horas após encerramento do evento.

## 5. Avaliação do Asaas — pendente de comprovação

Asaas permanece prioridade de avaliação, não integração aprovada ou concluída. Antes de escolher desenho final, verificar na documentação oficial atual e no Sandbox: produtos de split aplicáveis ao contrato; destinatários/subcontas e requisitos de cadastro; base bruta e taxas; disponibilidade e bloqueios de saldo; transferências; Pix; reembolsos integrais/parciais; contestação/chargeback; autenticação de webhooks; idempotência; limites e estados assíncronos; reconciliação; retenção de fundos até evento + 72 horas.

A decisão técnica deve registrar links e data da documentação consultada, resultados de testes Sandbox e limitações contratuais. Se o provedor não suportar a retenção exigida, bloquear o lançamento financeiro e apresentar alternativa de arquitetura/negócio ao CTO. Não prometer retenção como escrow nem contornar regras do provedor.

## 6. Requisitos de implementação e testes

- Ledger transacional imutável por lançamentos compensatórios, com IDs internos/externos, moeda, bruto, 17%, 83%, taxa, reserva, reembolsos, retenções, ajustes e repasses.
- Idempotência para criação de cobrança, processamento de webhook, reembolso e repasse.
- Webhooks autenticados conforme documentação oficial; persistir evento antes de processamento, validar montante/referência/estado e reconciliar quando ambíguo.
- Separar estado do pagamento, estado do reembolso, estado da contestação, elegibilidade de repasse e estado da transferência.
- Controle de acesso server-side, trilha de auditoria, notificações e alertas de exceção.
- Testes: 17/83 sobre bruto; taxa do provedor absorvida pela plataforma; reserva sem cobrança adicional; arredondamento em centavos; retenção não iniciada no pagamento; liberação exatamente após evento + 72h; DST/fuso e horários de fronteira; reembolso parcial/integral; contestação; falha e timeout; duplicidade; saldo insuficiente; taxa não recuperada; reembolso após repasse; divergência de conciliação; notificação da casa.
- Nenhuma integração financeira real, cobrança, transferência, credencial de produção ou alteração em banco faz parte da DOC-03.

## 7. Fontes e estado de evidência

A especificação financeira deriva da ordem DOC-03. A capacidade efetiva do Asaas e os termos do produto não foram comprovados nesta execução; devem ser verificados em documentação oficial e Sandbox antes de implementação. A existência de SDK ou de UI de pagamento no frontend não prova integração financeira.


## 8. Evidência documental oficial do Asaas consultada em 2026-10-25

A documentação oficial atual do Asaas apresenta limitações relevantes para o desenho de retenção:

- [FAQ oficial de Split](https://docs.asaas.com/docs/split-faq): informa que não é possível definir uma data futura para executar o Split; ele é processado automaticamente quando a cobrança é recebida. A própria FAQ sugere considerar um fluxo de transferência quando a operação precisa controlar quando o saldo será movimentado. Portanto, o Split padrão **não está comprovado como mecanismo de retenção até evento + 72 horas**.
- [Introdução oficial ao Split](https://docs.asaas.com/docs/split-de-pagamentos): descreve distribuição automática de parte dos valores recebidos para outras contas Asaas. Isso, por si só, não comprova escrow, retenção pós-evento ou a regra de absorção de taxas exigida pelo Ilê Conecta.
- [Endpoint oficial de estorno](https://docs.asaas.com/reference/estornar-cobranca): permite estorno integral/parcial de cobrança Pix/cartão; informa que taxas da cobrança não são devolvidas e que saldo disponível pode ser insuficiente para um estorno Pix, retornando erro. Isso confirma a necessidade de reserva operacional e de registrar taxa não recuperada/saldo insuficiente.
- [Eventos oficiais de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas): documentam eventos distintos para pagamento confirmado, saldo recebido/disponível, estornos parciais/totais, chargebacks e liquidação/cancelamento de Split.
- [Validação de saque via webhook](https://docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks) e [changelog de 28/09/2026](https://docs.asaas.com/changelog/valida%C3%A7%C3%A3o-de-saque-via-webhook-para-liquida%C3%A7%C3%A3o-de-splits-de-pagamento): descrevem uma autorização/recusa de operação de saída, inclusive liquidação de Split em configuração opcional. O evento ocorre perto da liquidação e não comprova, por si só, uma retenção temporizada de 72 horas.

### Conclusão técnica provisória

**Não usar o Split padrão como prova de atendimento à retenção de 72 horas.** A alternativa a avaliar é manter os valores na conta de origem e executar transferência somente após elegibilidade, reconciliação e aprovação do fluxo; a viabilidade contratual, de saldo, destinatários, taxas, estornos e compliance deve ser verificada em documentação aplicável e Sandbox. Até essa comprovação, a arquitetura financeira fica bloqueada para implementação. Nenhuma operação Sandbox foi executada nesta DOC-03.
