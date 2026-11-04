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

Valores iniciais de lançamento aprovados em 02/11/2026. Para cobrança mensal, a modalidade recorrente (Pix Automático ou cartão recorrente) utiliza o preço-base. Pagamento manual mensal por Pix ou cartão tem adicional comercial de 5%, informado com preço final antes da contratação. Ciclo, tributos, prorrata, inadimplência, carência, cancelamento e política de reajuste precisam estar descritos no contrato e implementados de forma coerente antes de cobrança real. A política de preços deve ser versionada e não pode alterar retroativamente contratos/assinaturas existentes.

As tarifas de cobrança recorrente da Efí serão absorvidas inicialmente pelo Ilê Conecta como custo de aquisição/operação. A decisão poderá ser revista por alteração futura de preços no painel, com vigência prospectiva, transparência e preservação das condições contratadas. O custo real por modalidade deve ser monitorado e conciliado; não presumir que o recurso de recorrência gratuito signifique transação sem tarifa.

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

## 7. Provedores e distribuição de responsabilidades

A arquitetura aprovada separa os fluxos por natureza econômica:

**Stripe — marketplace (clientes/casas):**
- Stripe Connect Direct Charges.
- Casa recebe diretamente sua parcela; plataforma recebe comissão via `application_fee_amount`.
- Comissão: 15% em rituais coletivos e 4% nas demais transações elegíveis.
- Sem escrow, retenção de 72 horas ou reserva financeira pela plataforma.

**Efí — monetização própria do Ilê Conecta:**
- Planos/assinaturas, vagas adicionais, créditos de IA, destaque, impulsionamento e outros produtos próprios.
- Modalidades previstas: Pix Automático e cartão recorrente pelo preço-base; Pix manual e cartão manual com adicional de 5%.
- Tarifas das modalidades recorrentes serão absorvidas inicialmente pela plataforma.
- Preços e tarifas podem ser revistos prospectivamente, preservando contratos e assinaturas existentes.
- Boleto pode ser considerado quando houver validação específica do fluxo e da experiência.

**Payment Core:**
- Núcleo único independente de provedor, com adaptadores Stripe e Efí.
- Provedor, ambiente, categoria, modalidade, IDs externos e versão das regras ficam registrados por transação/assinatura.
- Operações posteriores usam sempre o provedor de origem.
- Não existe troca retroativa, fallback silencioso ou alteração de provedor em operação já iniciada.
- Roteamento administrativo por categoria/modalidade será habilitado somente após validação da combinação e autorização.

A arquitetura está aprovada; a integração Efí ainda depende de homologação de assinaturas, Pix Automático, cobranças avulsas, cancelamentos, devoluções, webhooks e conciliação. Credenciais e certificados ficam apenas no backend, separados por ambiente.

Não declarar que valores de marketplace ficam retidos até três dias após o evento. A casa recebe diretamente conforme o modelo Stripe Direct Charges aprovado.

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

- Confirmar tarifas Efí efetivas para cada modalidade, inclusive cartão recorrente e Pix Automático, e monitorar custo por plano.
- Homologar autorização, cobrança inicial e subsequente, cancelamento, inadimplência, retries, webhooks e conciliação do Pix Automático.
- Homologar assinaturas de cartão e cobranças avulsas Efí.
- Validar adicional de 5% para pagamento mensal manual com jurídico e apresentação transparente no checkout.
- Validar regras de reajuste prospectivo, versionamento de preço e preservação de assinaturas existentes.

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
