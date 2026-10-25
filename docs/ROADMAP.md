# Ilê Conecta — Roadmap integral (baseline proposta)

> **Estado:** proposta para revisão do CTO; fases abaixo são uma reorganização documental proposta pela DOC-02, **não nomes nem números históricos recuperados**. Todas as fases `P-*` permanecem propostas sujeitas à aprovação explícita do CTO; não se afirma que existam fases oficiais anteriores. Nenhuma fase é considerada concluída por estar documentada.  
> Fonte de estado técnico: `main` SHA `93e7060756b29d397b75f2151d870606a33b9692`; branch EXEC-01 `fc69a5938c48f92cd79176d2b57de0930ffde5cd`; [PR #1](https://github.com/gusborba9-star/IleConecta/pull/1).

## Regras de estado

- **Não iniciada:** não há evidência de execução autorizada em curso.
- **Em andamento:** execução iniciada com evidência rastreável, mas critérios não satisfeitos.
- **Bloqueada:** pré-requisito ou decisão impede avanço.
- **Concluída:** entregáveis e testes especificados foram executados com evidência; ainda pode exigir aprovação.
- **Validada:** critérios de saída verificados e aprovação requerida registrada.

## Fases propostas (aguardam aprovação do CTO)

| ID proposto | Nome proposto | Objetivo e entregáveis | Requisitos Blueprint | Dependências / escopo excluído | Execuções associadas | Entrada e saída verificáveis | Testes/evidências e responsável | Estado real |
|---|---|---|---|---|---|---|---|---|
| P-DOC02-A | Baseline documental e decisões | Blueprint, regras financeiras, arquitetura proposta, registro de decisões e matriz de rastreabilidade | GOV-01; PROD-01; FIN-01–FIN-05; SEC-SECRET-01; referências de BACKEND_ARCHITECTURE.md | Depende da recuperação histórica; não aprova automaticamente as propostas | DOC-01, DOC-02 | Entrada: ordem DOC-02. Saída: documentos coerentes em branch e PR, pendências explícitas; validação final do CTO | Links/commits, matriz cruzada e revisão manual do CTO | **Em andamento** — arquivos propostos nesta branch; revisão pendente |
| P-TECH-01 | Qualidade de build e preparação de Preview | Corrigir incompatibilidades técnicas e obter build/verificações estáticas reproduzíveis | NFR-BUILD-01 | Não inclui merge nem produção; depende de ambiente com registry e acesso funcional | EXEC-01 | Entrada: diagnóstico. Saída: `npm ci`, build, lint e `npx tsc -b` executados e logs ligados ao SHA | Logs reais, status CI, inspeção de diff; executor + aprovação CTO | **Em andamento** — [PR #1](https://github.com/gusborba9-star/IleConecta/pull/1); testes não executados por limitação DNS reportada |
| P-ARCH-01 | Decisão e fundação do backend | Aprovar fronteiras de confiança, identidade, modelo relacional e contratos API | ROLE-01; AUTH-01; SEC-ISO-01; PRIV-01; BACKEND_ARCHITECTURE.md §§2–12 | Proposta de arquitetura; não declara schema Supabase existente; nenhuma alteração de banco nesta DOC-02 | A definir após aprovação | Entrada: decisão do CTO. Saída: contratos/modelo aprovados e plano de migração/testes | ADRs, diagramas, revisão de segurança; CTO aprova | **Bloqueada** — arquitetura e identidade pendentes |
| P-ID-01 | Identidade, autorização e isolamento | Implementar auth server-side, RBAC e testes de isolamento | ROLE-01; AUTH-01; SEC-ISO-01 | Exclui contas reais até política aprovada | A definir | Saída: testes positivos/negativos para cada perfil e acesso cruzado negado | Testes de integração e auditoria; CTO aprova | **Bloqueada** — backend e política de perfis não aprovados |
| P-CORE-01 | Casas, conteúdo e descoberta | APIs e persistência para casas, páginas, publicações, busca e moderação mínima aprovada | HOUSE-01; DISC-01 | Não inclui promoção paga sem decisão comercial | A definir | Saída: CRUD autorizado, visibilidade e moderação testados | Testes de contrato, autorização, regressão | **Não iniciada** como execução formal; UI existente não comprova backend |
| P-BOOK-01 | Atividades, vagas e reservas | Modelo transacional, estados, concorrência de vagas, expiração e cancelamento | EVENT-01; RES-01 | Não inicia cobrança real; depende de estados e política aprovados | A definir | Saída: sem oversell sob concorrência; transições inválidas rejeitadas | Testes concorrentes, integração e regressão | **Bloqueada** — regras de domínio pendentes |
| P-PAY-01 | Pix e Asaas Sandbox | Criar cobranças de teste, processar webhooks, idempotência e conciliação | FIN-01; FIN-05; PAY-01; WEBHOOK-01; IDEMP-01 | Sandbox apenas; sem credenciais reais ou produção; suporte a split deve ser confirmado com provedor | A definir após autorização | Saída: fluxo de ponta a ponta em Sandbox e casos de falha duplicados testados | Logs sanitizados, payloads de teste, reconciliação; CTO autoriza | **Bloqueada** — viabilidade técnica/contratual e arquitetura pendentes |
| P-SET-01 | Comissões, repasses, cancelamentos e reembolsos | Implementar regras financeiras aprovadas, ledger e janela de elegibilidade | FIN-02; FIN-03; FIN-04; FIN-REF-01 | Não liberar repasse até confirmar contrato, lei e política operacional | A definir | Saída: conciliação centavo a centavo e testes de cancelamento/reembolso/duplicidade | Casos de teste financeiros e reconciliação independente; CTO + validação jurídica/contábil necessária | **Bloqueada** |
| P-OPS-01 | Observabilidade, suporte e recuperação | Logs, métricas, alertas, auditoria, backup/restore e runbooks | AUDIT-01; PRIV-01; requisitos operacionais propostos em BACKEND_ARCHITECTURE.md §10 | Sem metas inventadas; SLO/RPO/RTO exigem aprovação | A definir | Saída: alertas testados e restauração/recuperação demonstrada | Evidências de teste e runbook; CTO aprova | **Não iniciada** |
| P-QA-01 | Qualificação integrada e Preview | Regressão, segurança, acessibilidade, testes E2E e Preview | TEST-REG-01; NFR-BUILD-01; DEPLOY-PREVIEW-01; REL-PROD-01 | Preview não equivale a produção; não altera produção | A definir | Saída: checklist completo, zero bloqueadores conhecidos, evidências ligadas ao SHA | CI, relatórios de teste e validação em Preview; CTO aprova | **Bloqueada** — verificações automáticas associadas à PR #2 reportaram falhas; causa não diagnosticada nesta DOC-02 |

| P-REL-01 | Autorização de lançamento | Revisão final, plano de rollback, monitoramento e autorização explícita | REL-PROD-01; AUDIT-01 | Produção fora do escopo DOC-02 e não autorizada aqui | Nenhuma | Entrada: todas as fases críticas validadas. Saída: autorização escrita do CTO e gates legais/operacionais atendidos | Checklist assinado, rollback testado; CTO | **Bloqueada** — sem autorização de produção |

## Estado de execuções conhecidas

### DOC-01
- **Estado:** verificação documental realizada até o limite do acesso disponível.
- **Mudanças:** nenhuma.
- Evidência: relatório DOC-01 na conversa; não foi localizado arquivo correspondente no repositório consultado.

### DOC-02
- **Estado:** em andamento para revisão do CTO; branch documental própria.
- **Escopo:** documentação, sem alterações na aplicação, banco ou produção.
- **Critério de conclusão:** revisão cruzada dos documentos, IDs/links/estados consistentes, commits/PR registrados, evidências verificadas e decisão explícita do CTO. Criar arquivos, por si só, não encerra a execução.
- **Verificações automáticas GitHub–Vercel:** a criação/atualização da PR #2 acionou verificações/Preview automaticamente. No SHA `ffff750506b844d24c6f4bf25c523a6ad34107d0`, a consulta de status em 2026-10-24 às 02:16 UTC mostrou dois status Vercel `failure` e um `pending`. Na consulta subsequente sobre o SHA `3558237767fcfd11c960b033a768374c734078d7`, às 02:18 UTC, os três status Vercel estavam `pending` e a mensagem automática do bot indicava `Building`. A falha foi observada no SHA anterior; esses registros são uma linha do tempo de status, não diagnóstico de causa raiz. A causa das falhas anteriores não foi diagnosticada, não houve deploy manual, e isso não foi atividade da EXEC-02.

### EXEC-01 — Correção do build e preparação técnica para Vercel
- **Estado:** **em andamento, aberta e independente**.
- Branch: `exec-01/fix-vite-build-vercel`.
- Commit de correção: [`01e16b4`](https://github.com/gusborba9-star/IleConecta/commit/01e16b4489b1ffc1b6eef7961498e4c73d849cf5).
- Commit de registro: [`fc69a59`](https://github.com/gusborba9-star/IleConecta/commit/fc69a5938c48f92cd79176d2b57de0930ffde5cd).
- PR #1: https://github.com/gusborba9-star/IleConecta/pull/1 — rascunho.
- **Não executados:** `npm ci`, `npm run build`, `npm run lint`, `npx tsc -b`, por falha de resolução DNS relatada ao tentar clonar.
- Pendência adicional: divergência entre dependências declaradas em `package.json` e o bloco de dependências de topo de `package-lock.json`; regeneração não feita.
- Critério de encerramento: executar comandos em ambiente funcional, registrar evidências e submeter a revisão do CTO. Não fazer merge sem autorização.

### EXEC-02
- **Estado:** não autorizada e não iniciada.
- Nenhuma execução, mudança de configuração ou ação de deploy deve ser atribuída a EXEC-02 nesta baseline.

## Gates transversais obrigatórios (propostos)

1. Build: instalação limpa e comandos exigidos executados; logs/status CI ligados ao SHA.
2. Auth/RBAC: testes de sessão, permissões por perfil e negação por padrão.
3. Isolamento: tentativas cruzadas entre usuários/casas falham no backend.
4. Integrações: segredos fora do cliente e logs; validação de origem e contratos.
5. Pagamentos: estados derivados de fonte confiável; não confirmar pelo redirect do navegador.
6. Webhooks: assinatura/autenticidade verificada conforme documentação do provedor, idempotência, retries seguros e reconciliação.
7. Cancelamentos/refundos/repasses: matriz de transições, prazos, ledger e casos de corrida.
8. Regressão: cenários críticos repetidos antes de cada promoção.
9. Preview: implantação isolada, testes E2E e evidência do SHA.
10. Produção: autorização explícita do CTO, plano de rollback, monitoramento e requisitos legais/contratuais atendidos.

## Histórico e aprovação

Não foram encontrados nomes ou números históricos de fases no material examinado. Os IDs `P-*` acima são rótulos propostos para discussão, não fatos históricos. Fases só devem ser renomeadas/reordenadas como baseline oficial após aprovação do CTO.


## DOC-03 — Regras financeiras aprovadas e execução de auditoria

A ordem DOC-03 aprova a especificação financeira FIN-01–FIN-11 em [FINANCIAL_RULES.md](FINANCIAL_RULES.md), mas **não** declara a implementação concluída. A reserva de 2% ainda precisa de decisão sobre base exata, finalidade e tratamento contábil antes da implementação.

| ID | Etapa | Dependências e saída verificável | Estado |
|---|---|---|---|
| P-DOC03-FIN | Consolidar regra financeira, retenção e exceções | Revisão cruzada de Blueprint, regras, registro de decisões, arquitetura e matriz; PR draft; revisão do CTO | Em revisão documental; implementação pendente |
| P-AUDIT-01 | Auditoria reproduzível de frontend, segurança e funcionalidades | Inventário por funcionalidade, riscos priorizados, arquivos/linhas e evidências reproduzíveis | Em andamento; sem alegação de produto operacional |
| P-BUILD-01 | Estabilização de dependências e build | `npm ci`, `npm run build`, `npm run lint`, `npx tsc -b` executados e logs associados ao SHA; testes de rotas | Bloqueada até execução real em ambiente funcional |
| P-PAY-ARCH-01 | Avaliar fluxo de pagamento/repasse Asaas | Fontes oficiais datadas + testes Sandbox; comprovar split, retenção, saldo, transferências e reembolsos; ADR submetida ao CTO | Pendente; sem integração nesta etapa |
| P-PAY-IMPL-01 | Implementar ledger e integração Sandbox | Somente após execução específica autorizada; testes idempotentes/negativos, reconciliação e revisão de segurança | Não iniciada; exige autorização própria |

### Requisitos e critérios financeiros de aceite

- FIN-01–FIN-03: prova de cálculo sobre bruto e taxa do provedor custeada pela plataforma.
- FIN-04: base, finalidade, titularidade e movimentação da reserva decididas e auditáveis.
- FIN-05: cálculos em centavos inteiros, arredondamento versionado e testes de fronteira.
- FIN-06: ledger com transação, comissão, casa, taxa, reembolso, retenção, saldo e repasse.
- FIN-07–FIN-09: testes de elegibilidade evento + 72h, fuso correto, contestação e bloqueio.
- FIN-10: identificador, destinatário, valor, data, estado e confirmação de cada repasse.
- FIN-11: capacidade do Asaas comprovada por documentação oficial e Sandbox, sem presumir escrow.
- AUDIT-01: inventário de funcionalidades reais, simuladas, dependentes de backend e inexistentes.
- BUILD-01: comandos reais e resultados preservados; nenhuma fase marcada concluída por documentação apenas.

Não alterar o estado de EXEC-01 nem de fases anteriores sem novas evidências. Não iniciar EXEC-02 nem a etapa de infraestrutura por inferência.