# ILÊ CONECTA — REGRAS COMERCIAIS E FINANCEIRAS

- Documento subordinado ao Blueprint definitivo.
- Status: decisões aprovadas + pendências de validação.
- Valores em BRL.
- Não constitui parecer jurídico nem autorização para cobrança real.

## 1. Princípios

1. Cada transação registra a versão da regra comercial vigente no momento da criação.
2. Mudanças futuras não recalculam transações históricas.
3. Backend e registros confirmados do provedor são autoridade financeira.
4. Interface, redirecionamento ou mensagem de sucesso não comprovam pagamento.
5. Comissão, tarifa do provedor, saldo da casa, repasse, reserva e reembolso são conceitos distintos.
6. Não prometer escrow, retenção ou garantia de reembolso sem suporte contratual e técnico comprovado.
7. Toda operação deve ser idempotente, conciliável e auditável.

## 2. Planos de assinatura aprovados

| Plano | Preço mensal |
|---|---:|
| Essencial | R$ 89,90 |
| Profissional | R$ 179,90 |
| Premium | R$ 299,90 |

Valores iniciais de lançamento aprovados em 02/11/2026. Ciclo, tributos, prorrata, inadimplência, carência, cancelamento e política de reajuste precisam estar descritos no contrato e implementados de forma coerente antes de cobrança real.

## 3. Comissões aprovadas

| Modalidade | Comissão da plataforma |
|---|---:|
| Rituais coletivos | 15% |
| Demais transações elegíveis | 4% |

A taxa aplicável deve ser definida pela modalidade e elegibilidade da transação. A classificação não pode ser escolhida livremente pelo frontend ou pela casa para reduzir comissão.

### 3.1 Versionamento

Cada transação deve preservar:
- Percentual aplicado.
- Base de cálculo.
- Valor bruto.
- Comissão da plataforma.
- Tarifas do provedor.
- Valor líquido devido à casa.
- Identificador e versão da regra.
- Provedor, moeda e identificadores externos.
- Estado financeiro e histórico de eventos.

O histórico de 17% encontrado em estruturas antigas não deve ser aplicado como regra vigente a novas transações. Também não se deve atualizar transações antigas em massa. A reconciliação e migração para as taxas aprovadas exigem auditoria e ordem específica.

## 4. Vagas adicionais de equipe

| Plano | Preço |
|---|---:|
| Essencial | R$ 29,90/mês por vaga adicional |
| Profissional | R$ 39,90/mês por vaga adicional |
| Premium | 1 vaga adicional incluída; extras R$ 39,90/mês |

Upgrade/downgrade não pode gerar cobrança ou vaga duplicada. Definir tratamento de vaga ocupada, cancelamento, ciclo e prorrata antes de ativar cobrança.

## 5. Créditos de IA

| Pacote | Preço |
|---|---:|
| 80 respostas | R$ 19,90 |
| 200 respostas | R$ 49,90 |
| 500 respostas | R$ 89,90 |

Os pacotes complementam a franquia mensal dos planos Profissional/Premium. Franquia incluída, expiração, acumulação, ordem de consumo, validade após cancelamento/downgrade e regra de reembolso permanecem pendentes. Uma resposta não pode ser debitada duas vezes por retry, falha ou webhook repetido.

## 6. Destaque e impulsionamento

- **Destaque:** compra de posicionamento privilegiado de casa, serviço ou ritual em áreas de descoberta.
- **Impulsionamento:** compra de distribuição ampliada de uma publicação/conteúdo no feed ou superfícies definidas.

Não são o mesmo produto. Devem ter inventário, entrega, métricas e identificação patrocinada apropriados. Durações aprovadas como opções: 3, 7 e 20 dias. Abrangência: cidade, estado ou país.

Preços, posições, frequência, limites, critérios de entrega, reembolso por não entrega e regras de concorrência entre campanhas ainda não estão aprovados. Compra real estava desabilitada para contas reais na auditoria; não presumir disponibilidade.

## 7. Pagamentos e provedor

A implementação auditada identificou Stripe Connect com direct charges e `application_fee_amount`. Essa configuração representa cobrança e comissão da plataforma; não equivale a escrow nem prova retenção do saldo na plataforma.

A decisão final sobre provedor e estrutura de liquidação deve ser formalizada. Há referências históricas/residuais a Asaas e Mercado Pago que precisam de reconciliação. Não ativar múltiplos provedores simultaneamente sem desenho e autorização.

Não declarar que os valores ficam retidos até três dias após o evento. Qualquer retenção, reserva, split ou prazo de repasse depende de produto do provedor, contrato, legislação e validação de ponta a ponta.

## 8. Cancelamentos, reembolsos e disputas

A plataforma deve permitir solicitar, acompanhar e auditar cancelamentos/reembolsos conforme modalidade, contrato, legislação e estado da execução. Solicitação não significa reembolso aprovado nem pagamento devolvido.

Estados mínimos conceituais:
- Não solicitado.
- Solicitado.
- Em análise.
- Aprovado ou recusado com justificativa.
- Enviado ao provedor.
- Confirmado pelo provedor.
- Falhou/necessita intervenção.
- Encerrado.

A devolução só é concluída após confirmação confiável do provedor. Disputas/chargebacks devem ser tratados separadamente, com evidências e trilha de decisão.

Política de prazo, responsabilidade econômica, exceções, não execução e divisão de perdas exige validação jurídica. Não usar silêncio do cliente como renúncia automática a direitos legais.

## 9. Rituais coletivos

Venda interna obrigatória, com controle de vagas e confirmação financeira. Uma reserva temporária de 15 minutos protege vaga/horário enquanto o checkout aguarda pagamento. Sem confirmação dentro do prazo, expira e libera capacidade, ressalvados eventos atrasados que exigem reconciliação e política de compensação.

O evento esgota quando todas as vagas confirmadas são ocupadas; caso contrário, novas participações encerram uma hora antes do início. O estado do ritual, pagamento e participação deve permanecer coerente e auditável.

## 10. Conciliação e ledger

O sistema deve distinguir:
- Valor bruto cobrado.
- Comissão da plataforma.
- Tarifa do provedor.
- Tributos/encargos quando aplicáveis.
- Valor líquido devido à casa.
- Valor efetivamente liquidado/transferido.
- Reembolso, estorno e chargeback.
- Reserva/ajuste, se houver mecanismo formal autorizado.

Não registrar repasse como realizado sem evidência do provedor. Não somar valores pendentes como receita liquidada. O ledger deve ser append-only ou preservar histórico imutável por lançamentos compensatórios.

## 11. Pendências obrigatórias antes de produção

- Parecer jurídico sobre intermediação, responsabilidade e modelo de pagamento.
- Provedor definitivo e modelo de Connect/liquidação.
- Tarifas, tributos e quem absorve cada custo.
- Prazos e condições de repasse.
- Política jurídica de cancelamento/reembolso por modalidade.
- Chargebacks, saldo negativo e responsabilidade por perdas.
- Regras de assinatura, inadimplência, prorrata e cancelamento.
- Créditos IA: franquias, validade e estornos.
- Preços e entrega de destaque/impulsionamento.
- Política de reservas com pagamento confirmado após expiração.
- Contratos da casa e transparência pré-compra.

## 12. Proibições

- Não aplicar 17% a novas transações por legado técnico.
- Não recalcular histórico quando a taxa mudar.
- Não considerar `application_fee_amount` como escrow.
- Não prometer retenção de saldo ou reembolso garantido sem comprovação.
- Não ativar cobrança real ou alterar provedor sem autorização expressa.
- Não marcar pagamento, repasse ou reembolso como concluído sem confirmação verificável.
