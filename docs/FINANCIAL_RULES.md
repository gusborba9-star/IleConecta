# Ilê Conecta — Regras financeiras

> **Estado:** regras de alto nível confirmadas pela ordem do CTO DOC-02; especificação operacional incompleta e não aprovada como implementação. Este documento não confirma capacidade do Asaas nem constitui parecer jurídico/contábil.

## 1. Regras explicitamente confirmadas pelo CTO

| ID | Regra | Estado/evidência |
|---|---|---|
| FIN-01 | Meio de pagamento previsto para lançamento: Pix | **Confirmada pelo CTO** na ordem DOC-02 |
| FIN-02 | Distribuição econômica: 17% para Ilê Conecta e 83% para a casa religiosa | **Confirmada pelo CTO** na ordem DOC-02 |
| FIN-03 | Reserva interna de 2% é alocada dentro da parcela de 17% da plataforma; não é uma terceira parcela | **Confirmada pelo CTO** na ordem DOC-02 |
| FIN-04 | Liberação de repasse planejada após o evento, com janela operacional de até três dias após encerramento | **Confirmada como intenção de negócio**, sujeita às regras aplicáveis de cancelamento, reembolso e direitos do consumidor |
| FIN-05 | Integração inicial Asaas deve permanecer em Sandbox até autorização posterior | **Confirmada pelo CTO** na ordem DOC-02 |
| SEC-SECRET-01 | Credenciais, segredos e chaves privadas não podem aparecer em documentos, código público ou logs | **Confirmada pelo CTO** na ordem DOC-02 |

## 2. Interpretação aritmética da reserva

A reserva de 2% é uma alocação interna dentro dos 17% da plataforma. A base exata de cálculo precisa ser confirmada se a intenção não for “2% do valor bruto da venda”. A interpretação literal mais consistente com “2% dentro da parcela de 17%” é **2% da parcela da plataforma**, mas isso é cálculo derivado, não decisão financeira adicional.

Exemplo meramente ilustrativo, se o CTO confirmar que a reserva é 2% da parcela de 17%:
- Venda bruta: R$ 100,00.
- Parcela da casa (83%): R$ 83,00.
- Parcela bruta da plataforma (17%): R$ 17,00.
- Reserva interna (2% de R$ 17,00): R$ 0,34.
- Parcela restante da plataforma após reserva: R$ 16,66.

Este exemplo não define a quem pertence contabilmente a reserva, em qual conta fica, quando pode ser utilizada, nem a base de cálculo final. Esses pontos requerem decisão.

## 3. Itens não confirmados e bloqueadores

- Se a taxa de processamento do provedor é absorvida pela plataforma, casa ou comprador.
- Se a divisão 17%/83% deve ocorrer automaticamente pelo provedor, via saldo/contas vinculadas, ou por processo posterior.
- Se o Asaas suporta no produto/contrato aplicável o split exato, Pix, retenção e prazo desejados.
- Identidade/KYC da plataforma e das casas, habilitação de subcontas e requisitos de compliance.
- Quem figura como vendedor/fornecedor perante o consumidor e como a cobrança aparece no extrato.
- Base de cálculo para taxas, arredondamento, descontos, cupons, chargebacks e estornos parciais.
- Base, titularidade, uso, liberação e contabilização da reserva interna de 2%.
- Momento exato de início e término dos “até três dias”: fuso horário, dia corrido ou útil, feriados e definição do encerramento do evento.
- Regras para evento cancelado, adiado, não realizado, parcialmente realizado ou contestado.
- Cancelamento pelo participante/casa, prazos de solicitação, reembolso integral/parcial, custos não reembolsáveis (se legalmente admissíveis) e tratamento de disputa.
- Regras de elegibilidade e bloqueio de repasse enquanto houver solicitação de cancelamento, suspeita de fraude ou conciliação pendente.
- Procedimentos para falha, duplicidade ou indisponibilidade do provedor.
- Documentação jurídica, fiscal e contábil aplicável; validação profissional necessária.

## 4. Modelo de estados proposto (não implementado/validado)

### Pagamento
`CRIADO → AGUARDANDO_PAGAMENTO → CONFIRMADO`; caminhos alternativos: `EXPIRADO`, `CANCELADO`, `FALHOU`, `ESTORNO_PENDENTE`, `ESTORNADO`, `EM_DISPUTA`.

### Reserva
`INICIADA → AGUARDANDO_PAGAMENTO → CONFIRMADA`; alternativas: `EXPIRADA`, `CANCELADA`, `REEMBOLSO_PENDENTE`, `REEMBOLSADA`.

### Repasse
`BLOQUEADO → ELEGÍVEL → SOLICITADO → PROCESSANDO → PAGO`; caminhos alternativos: `RETIDO`, `FALHOU`, `CANCELADO`, `RECONCILIAÇÃO_PENDENTE`.

Os nomes e transições são propostas. Estados do provedor devem ser mapeados para estados internos sem perder o evento original, horário, identificador e histórico. Não tratar um retorno de navegador como prova de pagamento.

## 5. Requisitos financeiros propostos para implementação

1. Calcular valores em unidades monetárias inteiras (centavos) ou decimal de precisão controlada; não usar aritmética binária de ponto flutuante para liquidação.
2. Registrar snapshots de preço, percentuais e política aplicáveis à transação, para que alteração futura de configuração não reescreva transações antigas.
3. Gerar identificadores únicos e chaves de idempotência para criação de cobrança, cancelamento, reembolso e repasse.
4. Não confirmar reserva até evento confiável do provedor e reconciliação do valor, moeda, destinatário e referência esperados.
5. Controlar concorrência de vagas com transação/constraint no backend.
6. Processar webhooks repetidos ou fora de ordem sem duplicar efeitos; manter eventos recebidos e resultado de processamento auditáveis.
7. Conciliar cobranças, tarifas, split, reembolsos e repasses contra extratos/relatórios do provedor.
8. Nunca registrar tokens, segredos, dados de pagamento desnecessários ou payloads sensíveis em logs.
9. Aplicar elegibilidade de repasse somente após o evento encerrado e dentro da janela operacional pretendida, respeitando pendências legais/operacionais e política aprovada.
10. Separar o ledger interno dos saldos apresentados pelo provedor; toda diferença deve gerar exceção reconciliável.
11. Definir comportamento de falha parcial, retries, intervenção manual e dupla aprovação para operações financeiras de alto risco.
12. Disponibilizar comprovantes e histórico com acesso limitado ao participante, à casa e à equipe autorizada.

## 6. Segurança e ambiente

- Sandbox Asaas somente até autorização expressa posterior.
- Segredos apenas em armazenamento seguro de ambiente/secret manager e acessíveis somente a serviços autorizados.
- Proibido publicar chaves em frontend, Git, documentação, screenshots ou logs.
- Dados de Sandbox não podem ser tratados como transações reais.
- A mudança para produção exige validação técnica, contratual, jurídica/contábil, teste de ponta a ponta e autorização explícita do CTO.

## 7. Critérios de aceite propostos

- Testes de divisão para valores baixos, altos, descontos e arredondamentos; soma das parcelas consistente com o valor bruto e custos explicitamente tratados.
- Repetição da mesma solicitação não cria cobranças, reembolsos ou repasses duplicados.
- Webhooks inválidos não mudam estado; eventos válidos repetidos não duplicam efeitos.
- Pagamento de valor/referência incorretos não confirma a reserva.
- Cancelamento e reembolso obedecem à matriz aprovada e mantêm trilha auditável.
- Repasse não se torna elegível antes do encerramento do evento nem ignora pendências aplicáveis.
- Conciliação identifica divergências e não as resolve silenciosamente.
- Evidências de testes e logs sanitizados ficam vinculadas ao commit/execução.

## 8. Aprovações ainda necessárias

O CTO deve confirmar: base da reserva de 2%; titularidade/uso da reserva; tratamento de taxas do provedor; política de cancelamento e reembolso; definição operacional de “até três dias”; modelo de split/repasse; estados finais; regras de arredondamento e conciliação. A capacidade e os termos do Asaas devem ser confirmados diretamente na documentação/contrato aplicáveis antes de desenhar uma integração dependente deles.
