# Ilê Conecta — Registro de decisões e lacunas (DOC-02)

> Este registro separa decisões explícitas, evidências de código não validadas, propostas e questões em aberto. A ausência de documento no repositório consultado não prova que uma decisão nunca existiu.

## A. Decisões confirmadas pelo CTO na ordem DOC-02

| ID | Decisão | Evidência | Implicação |
|---|---|---|---|
| D-001 | Hierarquia BLUEPRINT → ROADMAP → EXECUÇÕES → CÓDIGO | Ordem DOC-02 | Execução e código devem referenciar requisitos documentados |
| D-002 | Pix previsto para o lançamento | Ordem DOC-02 | Não implica integração pronta |
| D-003 | Distribuição 17% plataforma / 83% casa | Ordem DOC-02 | Implementação financeira permanece pendente |
| D-004 | Reserva de 2% é interna à parcela de 17%, não terceira parcela | Ordem DOC-02 | Base/titularidade/uso ainda precisam ser detalhados |
| D-005 | Repasse planejado após evento, janela operacional de até 3 dias | Ordem DOC-02 | Sujeito a cancelamento, reembolso e direitos do consumidor |
| D-006 | Asaas em Sandbox até autorização posterior | Ordem DOC-02 | Sem produção ou credenciais reais nesta etapa |
| D-007 | Segredos/credenciais/chaves privadas não podem estar em documentos, código público ou logs | Ordem DOC-02 | Requisito transversal de segurança |
| D-008 | DOC-02 é documental, branch própria; sem alterações de app, banco ou produção; sem merge | Ordem DOC-02 | Limite desta execução |
| D-009 | EXEC-01 permanece aberta; EXEC-02 não autorizada | Ordem DOC-02 | Não mudar estados nem iniciar EXEC-02 |

## B. Requisitos recuperados de código/histórico, ainda não validados

| ID | Evidência | O que permite afirmar | O que não permite afirmar |
|---|---|---|---|
| E-001 | [README.md main](https://github.com/gusborba9-star/IleConecta/blob/main/README.md), blob `2409ff6e4248d76c2bf1b56ab418549ca7be0a90` | Stack de frontend descrita como Vite, TypeScript, React, shadcn/ui, Tailwind | Não documenta visão, requisitos ou backend |
| E-002 | [AppContext.tsx](https://github.com/gusborba9-star/IleConecta/blob/main/src/contexts/AppContext.tsx) e [storage.ts](https://github.com/gusborba9-star/IleConecta/blob/main/src/lib/storage.ts) | Estado e persistência local usados no protótipo | Não comprova backend/autenticação segura |
| E-003 | [mockData.ts](https://github.com/gusborba9-star/IleConecta/blob/main/src/lib/mockData.ts) | Dados fictícios de casas, pessoas, rituais, publicações e conversas | Não prova cadastros reais nem conteúdo validado |
| E-004 | [RitualPurchaseModal.tsx](https://github.com/gusborba9-star/IleConecta/blob/main/src/components/ritual/RitualPurchaseModal.tsx) | Compra simulada, timer local, texto “Pagamento simulado”, percentuais variáveis 10/12/15% | Não prova Pix/Asaas real, 17/83, split ou repasse |
| E-005 | [PR #1](https://github.com/gusborba9-star/IleConecta/pull/1) e [ROADMAP da branch EXEC-01](https://github.com/gusborba9-star/IleConecta/blob/exec-01/fix-vite-build-vercel/ROADMAP.md) | EXEC-01 em andamento, testes não executados por falha de DNS reportada | Não prova build bem-sucedido nem aprovação do CTO |
| E-006 | Árvore de `main` e branch EXEC-01 inspecionadas | No conjunto de caminhos e branches acessíveis examinados, não foram localizados Blueprint anterior, Roadmap integral aprovado, ADRs ou política formal | Não prova inexistência fora do repositório/branches consultadas |

## C. Propostas novas que dependem de aprovação do CTO

Os IDs `PROP-001` a `PROP-007` identificam propostas no registro de decisões; os IDs `P-*` identificam fases propostas do Roadmap. São namespaces distintos.

| ID | Proposta | Onde registrada |
|---|---|---|
| PROP-001 | Ciclos de vida de atividade, reserva, pagamento, reembolso e repasse | [Blueprint](BLUEPRINT.md), [Regras Financeiras](FINANCIAL_RULES.md) |
| PROP-002 | Backend confiável separado do frontend, API server-side, modelo relacional e ledger auditável | [Arquitetura Backend](BACKEND_ARCHITECTURE.md) |
| PROP-003 | Entidades conceituais e constraints de integridade | [Arquitetura Backend](BACKEND_ARCHITECTURE.md) |
| PROP-004 | Fases `P-*` do Roadmap e seus gates | [Roadmap](ROADMAP.md) |
| PROP-005 | Requisitos de auth/RBAC, isolamento, observabilidade, retenção e recuperação | Blueprint e Arquitetura Backend |
| PROP-006 | Critérios de aceite e testes automatizados da matriz | [Rastreabilidade](TRACEABILITY.md) |
| PROP-007 | Uso de 2% da parcela da plataforma interpretado como 2% de R$ 17 em uma venda de R$ 100 | [Regras Financeiras](FINANCIAL_RULES.md) — exemplo ilustrativo, requer confirmação da base e da titularidade |

## D. Questões em aberto

1. Há Blueprint/Roadmap/decisões anteriores fora das branches acessíveis? Solicitar fonte ou link ao CTO se houver.
2. Qual é a versão aprovada da visão, público, perfis e escopo de lançamento?
3. Quais módulos entram no lançamento e em que ordem?
4. Qual é o provedor de identidade e a matriz definitiva de papéis/permissões?
5. O backend e o banco serão Supabase/PostgreSQL? Qual schema existe hoje, se algum? Precisa ser verificado antes de migração.
6. Qual é a política de verificação de casas, moderação e denúncias?
7. A reserva de 2% incide sobre qual base, quem a detém e como pode ser utilizada?
8. Quem absorve as tarifas do provedor? Como ficam descontos, arredondamento e reembolso parcial?
9. O produto/contrato do Asaas suporta Pix, split e repasse com os termos desejados? Qual é o mecanismo oficial de webhook/autenticidade?
10. Como se define “até três dias” (corridos/úteis, fuso, feriados e horário de encerramento)?
11. Qual é a política de cancelamento, adiamento, não realização, reembolso e disputa?
12. Quais metas de disponibilidade, latência, retenção, RPO/RTO e cobertura de testes são exigidas?
13. Quais são os critérios finais para Preview e lançamento, incluindo rollback e aprovações jurídicas/contábeis?

## E. Governança e estado

- A documentação criada nesta branch é uma **proposta para revisão** e não está oficialmente aprovada.
- Não foram alterados documentos de `main`, código da aplicação, dependências, lockfiles, banco ou produção nesta execução documental.
- EXEC-01 permanece aberta, em branch e PR próprios.
- EXEC-02 permanece não autorizada e não iniciada.
- A integração GitHub–Vercel acionou verificações automáticas associadas à PR #2; no SHA `ffff750506b844d24c6f4bf25c523a6ad34107d0`, dois status falharam e um permaneceu pendente (consulta em 2026-10-24 02:16 UTC). Isso é automação da integração GitHub–Vercel, não uma execução da EXEC-02; nenhuma tentativa manual de deploy foi feita.
- Qualquer mudança de status de requisito/fase exige evidência e, quando aplicável, aprovação explícita do CTO.


## D. Decisões aprovadas na ordem DOC-03

| ID | Decisão do CTO | Implicação / limite |
|---|---|---|
| D-010 | Comissão da plataforma = 17% do valor bruto de cada transação. | Cálculo em centavos inteiros; versão da regra persistida. |
| D-011 | Direito bruto da casa = 83% do valor bruto. Taxas do provedor são despesa da plataforma e não reduzem esse direito. | Exemplo R$ 100,00: R$ 17,00 plataforma, R$ 83,00 casa; taxa de R$ 3,00 é absorvida pela plataforma. |
| D-012 | Reserva de 2% dentro dos 17%, sem cobrança adicional. | Base exata, finalidade, titularidade e uso continuam pendentes de decisão complementar. |
| D-013 | Retenção de 72 horas após encerramento efetivo do evento, fuso `America/Sao_Paulo`. | Nunca contar desde o pagamento; vencimento não libera automaticamente sem reconciliação. |
| D-014 | Reembolsos, contestações e saldo real devem ser verificados antes do repasse; contestação pendente bloqueia valor afetado. | Implementação exige estados explícitos, ledger, idempotência e trilha de auditoria. |
| D-015 | Asaas é prioridade de avaliação, sem capacidade presumida. | Split, retenção, saldo, transferência, reembolso e escrow exigem comprovação oficial e Sandbox. |
| D-016 | DOC-03 autoriza documentação e auditoria isolada, sem merge, pagamentos reais, produção, configuração Vercel/Supabase ou credenciais. | Qualquer etapa posterior exige ordem específica. |
| D-017 | Arredondamento monetário: calcular a parcela da casa por half-up sobre 83% do bruto em centavos; calcular a comissão como bruto menos parcela da casa, garantindo conservação exata dos centavos e protegendo o direito da casa. | Regra determinística de especificação; implementação exige testes de fronteira. |

### E. Decisões ainda necessárias

- **DEC-FIN-01:** definir a base dos 2% da reserva (valor bruto ou comissão de 17%), titularidade contábil, finalidade, conta/ledger, uso e liberação.
- **DEC-FIN-02:** aprovar política contratual/jurídica de cancelamentos, reembolsos, chargebacks e recuperação de valores após repasse.
- **DEC-PAY-01:** escolher desenho técnico apenas após comprovação da capacidade do Asaas no contrato e Sandbox; definir contingência se não houver retenção compatível.
- **DEC-ROUND-01:** regra documental especificada em D-017/FIN-05: parcela da casa = half-up de 83% do bruto em centavos; comissão = bruto − parcela da casa. A implementação deve demonstrar invariantes por testes automatizados antes de qualquer lançamento.
- **DEC-ARCH-01:** aprovar ledger, estados, política de idempotência, reconciliação, notificações e limites de autorização antes de implementação.
