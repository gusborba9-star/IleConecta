# Ilê Conecta — Checklist mestre de rastreabilidade

> **Estado:** matriz inicial proposta para revisão do CTO. Os IDs abaixo são identificadores documentais novos da DOC-02, não IDs históricos recuperados. A coluna “implementação observada” registra apenas o que foi localizado no código; não equivale a aprovação. Onde fase ou execução não foi aprovada, isso é explícito.

## Estados padronizados

- **CONFIRMADO-CTO:** explicitamente definido na ordem DOC-02.
- **RECUPERADO-NÃO-VALIDADO:** encontrado em UI/modelo/código/histórico, sem aprovação funcional.
- **PROPOSTA-AGUARDA-CTO:** requisito recomendado/documentado para decisão.
- **BLOQUEADO:** falta decisão, dependência ou evidência que impede validação.
- **NÃO-IMPLEMENTADO-COMPROVADO:** fluxo demonstrativo/local, sem backend de produção demonstrado.
- **VALIDADO:** só usar após teste/evidência real e aprovação requerida. Nenhum requisito desta matriz recebe esse estado nesta versão.

## Matriz principal

| ID | Requisito | Blueprint | Roadmap | Execução | Arquivo/componente observado ou esperado | Teste/evidência exigida | Critério de aceite verificável | Estado | Aprovação CTO |
|---|---|---|---|---|---|---|---|---|---|
| GOV-01 | Manter hierarquia Blueprint → Roadmap → Execuções → Código | §1 | P-DOC02-A | DOC-02 | docs/BLUEPRINT.md, docs/ROADMAP.md | Revisão cruzada dos links/IDs | Roadmap não contradiz Blueprint; execução referencia requisitos | PROPOSTA-AGUARDA-CTO | Pendente |
| PROD-01 | Propósito, público e proposta de valor | §2 | P-DOC02-A | DOC-02 | docs/BLUEPRINT.md | Aprovação explícita | Formulação e público-alvo aprovados | RECUPERADO-NÃO-VALIDADO | Pendente |
| ROLE-01 | Perfis e matriz de permissões | §3, §9 | P-ARCH-01, P-ID-01 | A definir | AppContext.tsx / types; futuro backend | Testes positivos/negativos por perfil | Ações permitidas e negadas cobrem todos os recursos sensíveis | PROPOSTA-AGUARDA-CTO | Pendente |
| HOUSE-01 | Cadastro/verificação e página da casa | §4 | P-CORE-01 | A definir | UI atual; futuro API/backend | Testes de cadastro, verificação e visibilidade | Só casa autorizada publica; campos e política aprovados | RECUPERADO-NÃO-VALIDADO | Pendente |
| DISC-01 | Descoberta e divulgação pública | §4 | P-CORE-01 | A definir | src/pages/Discover.tsx; futuro API | Testes de filtros, visibilidade e moderação | Resultados respeitam filtros e dados públicos autorizados | RECUPERADO-NÃO-VALIDADO | Pendente |
| EVENT-01 | Atividades/rituais com preço, data, modalidade e capacidade | §5 | P-BOOK-01 | A definir | src/types/index.ts; mockData.ts | Validação de campos e estados | Atividade publicada satisfaz regras aprovadas | RECUPERADO-NÃO-VALIDADO | Pendente |
| RES-01 | Reserva transacional e controle de vagas concorrentes | §5–6 | P-BOOK-01 | A definir | RitualPurchaseModal.tsx é simulação; futuro backend | Teste concorrente de última vaga e idempotência | Nunca excede capacidade; duplicidade não cria reserva extra | NÃO-IMPLEMENTADO-COMPROVADO | Pendente |
| AUTH-01 | Autenticação segura server-side | §3, §9; BACKEND §5 | P-ID-01 | A definir | Login/Register atuais; AppContext.tsx | Testes de sessão, recuperação, revogação e abuso | Sem autenticação baseada somente em estado local/localStorage | NÃO-IMPLEMENTADO-COMPROVADO | Pendente |
| SEC-ISO-01 | Isolamento entre pessoas/casas e autorização por recurso | §9; BACKEND §5 | P-ID-01 | A definir | Futuro backend e política de acesso | Testes cruzados A/B e Casa A/B | Todas as tentativas não autorizadas são negadas no servidor | BLOQUEADO | Pendente |
| SEC-SECRET-01 | Segredos fora de código público, frontend e logs | §9; FINANCIAL_RULES §6 | P-ARCH-01, P-PAY-01 | A definir | Configuração/CI/serviços a definir | Varredura de segredos e revisão de bundle/logs | Nenhum segredo real exposto; rotação documentada | CONFIRMADO-CTO (regra); implementação não validada | Pendente de evidência |
| FIN-01 | Pix como meio previsto para lançamento | FINANCIAL_RULES §1 | P-PAY-01 | A definir | RitualPurchaseModal mostra Pix simulado | Testes Asaas Sandbox e conciliação | Cobrança Pix de teste vinculada a reserva correta | CONFIRMADO-CTO; integração não validada | Pendente |
| FIN-02 | Split econômico 17% plataforma / 83% casa | FINANCIAL_RULES §1 | P-SET-01 | A definir | Modal usa percentuais mock 10/12/15% | Testes financeiros e confirmação contratual | Soma, arredondamento, tarifas e destinatários reconciliados | CONFIRMADO-CTO; não implementado | Pendente |
| FIN-03 | Reserva interna de 2% dentro da parcela da plataforma | FINANCIAL_RULES §2 | P-SET-01 | A definir | Nenhum componente verificado | Teste de cálculo + aprovação da base | Reserva não é terceira parcela e base está aprovada | CONFIRMADO-CTO; base exata/titularidade pendentes | Pendente |
| FIN-04 | Repasse após evento em janela operacional de até 3 dias | FINANCIAL_RULES §1, §5 | P-SET-01 | A definir | Nenhum backend de repasse verificado | Testes de elegibilidade, fuso, feriados e bloqueios | Nenhum repasse antes do evento; pendências respeitadas | CONFIRMADO-CTO como intenção; operacionalização pendente | Pendente |
| FIN-05 | Asaas permanece Sandbox até autorização posterior | FINANCIAL_RULES §1, §6 | P-PAY-01 | A definir | Integração não comprovada | Verificação de ambiente/credenciais e testes | Nenhuma chamada/credencial de produção sem autorização | CONFIRMADO-CTO; integração não validada | Pendente de evidência |
| PAY-01 | Confirmar pagamento por evento confiável, não por redirect | BACKEND §6 | P-PAY-01 | A definir | Modal atual confirma localmente após timer | Testes com redirect falso e evento verificado | Redirect sozinho nunca confirma pagamento | NÃO-IMPLEMENTADO-COMPROVADO | Pendente |
| WEBHOOK-01 | Autenticar origem e validar webhooks | BACKEND §7 | P-PAY-01 | A definir | Nenhum endpoint comprovado | Eventos válidos/inválidos, assinatura e logs | Evento não verificado não altera estado | BLOQUEADO | Pendente |
| IDEMP-01 | Idempotência de cobranças, eventos, reembolsos e repasses | BACKEND §7 | P-PAY-01, P-SET-01 | A definir | Nenhuma implementação comprovada | Repetir requisição/evento várias vezes | Um efeito financeiro por operação lógica | BLOQUEADO | Pendente |
| FIN-REF-01 | Cancelamentos/reembolsos com estados e trilha | FINANCIAL_RULES §3–7 | P-SET-01 | A definir | Nenhum backend comprovado | Matriz de cenários e reconciliação | Reembolso compatível com política e nunca duplica | BLOQUEADO | Pendente |
| AUDIT-01 | Auditoria de ações administrativas e financeiras | BLUEPRINT §10; BACKEND §10 | P-OPS-01 | A definir | Nenhuma trilha formal localizada | Teste de eventos e controle de acesso | Ação crítica registra ator, motivo, recurso e horário | PROPOSTA-AGUARDA-CTO | Pendente |
| PRIV-01 | Minimização, retenção, exportação e exclusão de dados | BLUEPRINT §9 | P-ARCH-01 | A definir | Política formal não localizada | Testes de direitos/retention e revisão jurídica | Política aprovada e aplicada sem quebrar registros obrigatórios | BLOQUEADO | Pendente |
| NFR-BUILD-01 | Build e verificações estáticas reproduzíveis | ROADMAP P-TECH-01 | P-TECH-01 | EXEC-01 | package.json, vite.config.ts, package-lock.json; [PR #1](https://github.com/gusborba9-star/IleConecta/pull/1) | npm ci, build, lint, tsc -b com logs | Todos os comandos executam e falhas são resolvidas/documentadas | EM ANDAMENTO; testes não executados | Pendente |
| TEST-REG-01 | Testes de regressão para fluxos críticos | BLUEPRINT §11 | P-QA-01 | A definir | Suite de testes a inventariar | CI e resultados ligados ao SHA | Fluxos críticos passam após mudança | BLOQUEADO | Pendente |
| DEPLOY-PREVIEW-01 | Preview isolado e validado antes de produção | ROADMAP P-QA-01 | P-QA-01 | A definir | Verificações automáticas GitHub–Vercel associadas à PR #2; status de deploy falharam no SHA `ffff750506b844d24c6f4bf25c523a6ad34107d0` | URL/commit Preview, E2E, logs e rollback de Preview | Preview corresponde ao SHA e não altera produção | BLOQUEADO — status automáticos de Vercel com falha; causa não diagnosticada | Pendente |
| REL-PROD-01 | Produção exige gates e autorização explícita | BLUEPRINT §11; ROADMAP P-REL-01 | P-REL-01 | Nenhuma | Infra não alterada nesta DOC-02 | Registro de autorização, checklist, rollback | Nenhuma publicação sem todos gates e aprovação | CONFIRMADO como restrição desta ordem; execução não aplicável | Pendente |

## Checklist verificável de qualidade e segurança

### Build e verificações estáticas
- [ ] Registrar SHA exato e ambiente.
- [ ] Executar `npm ci`; guardar saída e código de retorno.
- [ ] Executar `npm run build`; guardar artefatos/log.
- [ ] Executar `npm run lint`; registrar erros/avisos.
- [ ] Executar `npx tsc -b`; registrar resultado.
- [ ] Revisar divergências package.json/package-lock.json.
- [ ] Associar evidência à execução/PR; não marcar concluído por inspeção estática.

### Autenticação, autorização e isolamento
- [ ] Testar login, logout, expiração, revogação e recuperação.
- [ ] Testar matriz de permissões por perfil e recurso.
- [ ] Testar acesso cruzado entre usuários e casas.
- [ ] Testar enumeração/manipulação de IDs e chamadas diretas à API.
- [ ] Confirmar que nenhum segredo é exposto em bundle, repositório ou logs.
- [ ] Testar minimização, retenção e operações de privacidade.

### Pagamentos, webhooks e integridade
- [ ] Confirmar documentação/contrato do Asaas aplicável a Pix, split e repasses.
- [ ] Executar somente em Sandbox até autorização posterior.
- [ ] Testar valor/referência incorretos e redirect falso.
- [ ] Testar webhooks inválidos, repetidos, atrasados e fora de ordem.
- [ ] Testar idempotência de cobrança, reserva, reembolso e repasse.
- [ ] Testar concorrência de vagas.
- [ ] Testar cancelamento, reembolso, janela de repasse e eventos não realizados.
- [ ] Conciliar ledger interno com relatórios do provedor e investigar divergências.
- [ ] Validar logs sanitizados e trilhas de auditoria.

### Regressão, Preview e produção
- [ ] Rodar regressão automatizada e E2E.
- [ ] Implantar Preview sem tocar produção.
- [ ] Confirmar URL/commit da Preview e executar testes contra ela.
- [ ] Revisar vulnerabilidades e acessibilidade conforme escopo aprovado.
- [ ] Confirmar plano de rollback, alertas e recuperação.
- [ ] Obter autorização explícita do CTO antes de qualquer promoção a produção.

## Verificação de estado da DOC-02

- A revisão de links relativos e referências cruzadas alinhou os namespaces de requisitos/fases; a fase proposta `P-QA-01` está listada uma única vez no Roadmap.
- No SHA anterior `ffff750506b844d24c6f4bf25c523a6ad34107d0`, foram observados dois status Vercel `failure` e um `pending`; no SHA atual `3558237767fcfd11c960b033a768374c734078d7`, os três status consultados estavam `pending` e o bot indicou `Building`. Falha anterior observada, causa raiz não identificada; nenhum deploy manual foi feito para corrigi-la.
- DOC-02 permanece em revisão; a decisão final de encerramento cabe ao CTO.

## Requisitos ainda sem cobertura/evidência

- Não foi recuperado um Blueprint anterior aprovado nem um Roadmap integral histórico.
- Não há IDs históricos de requisitos recuperados; os IDs nesta matriz foram criados nesta DOC-02.
- Não foram localizados critérios de aceitação aprovados, suite formal de testes ou ADRs.
- Não foi comprovado backend funcional, schema Supabase, autenticação segura, APIs, webhooks, ledger, conciliação ou repasses.
- Nenhum requisito está VALIDADO nesta matriz.
- EXEC-01 não tem evidência de execução dos comandos de build; EXEC-02 não foi iniciada.


## DOC-03 — Requisitos financeiros e evidências de aceite

| ID | Requisito verificável | Blueprint | Roadmap | Execução prevista | Teste/evidência obrigatória | Estado |
|---|---|---|---|---|---|---|
| FIN-01 | Comissão = 17% do bruto | § DOC-03 | P-DOC03-FIN / P-PAY-IMPL-01 | Execução financeira futura | Testes de centavos e ledger comparando bruto/comissão | APROVADO-CTO; não implementado |
| FIN-02 | Direito bruto da casa = 83% do bruto | § DOC-03 | P-DOC03-FIN / P-PAY-IMPL-01 | Execução financeira futura | Exemplo R$ 100,00 => R$ 83,00 antes de ajustes legítimos | APROVADO-CTO; não implementado |
| FIN-03 | Taxa do provedor suportada pela plataforma | § DOC-03 | P-PAY-ARCH-01 / P-PAY-IMPL-01 | Execução financeira futura | Teste de taxa sem redução dos 83% | APROVADO-CTO; não implementado |
| FIN-04 | Reserva 2% interna aos 17% e rastreável | § DOC-03 | P-DOC03-FIN | Decisão DEC-FIN-01 + execução futura | ADR, ledger e conciliação da reserva | Parcialmente especificado; base pendente |
| FIN-05 | Valores em centavos e arredondamento explícito | § DOC-03 | P-PAY-IMPL-01 | Execução financeira futura | Testes de fronteira, valores ímpares e invariantes | APROVADO-CTO; política final pendente |
| FIN-06 | Ledger registra bruto, parcelas, taxas, reembolsos, retenção e repasse | § DOC-03 | P-PAY-IMPL-01 | Execução financeira futura | Esquema revisado, invariantes e auditoria de lançamentos | Não implementado |
| FIN-07 | Retenção termina 72h após encerramento do evento em America/Sao_Paulo | § DOC-03 | P-PAY-ARCH-01 / P-PAY-IMPL-01 | Execução financeira futura | Testes de fronteira com evento, fuso e horário | APROVADO-CTO; não implementado |
| FIN-08 | Só liberar após verificar reembolsos, contestações e saldo disponível | § DOC-03 | P-PAY-IMPL-01 | Execução financeira futura | Testes de bloqueio e reconciliação | APROVADO-CTO; não implementado |
| FIN-09 | Contestação pendente bloqueia valor afetado | § DOC-03 | P-PAY-IMPL-01 | Execução financeira futura | Teste negativo de repasse durante contestação | APROVADO-CTO; não implementado |
| FIN-10 | Repasse rastreável com confirmação do provedor | § DOC-03 | P-PAY-IMPL-01 | Execução financeira futura | Identificador, destinatário, valor, data, estado, evidência | APROVADO-CTO; não implementado |
| FIN-11 | Capacidades Asaas comprovadas antes da decisão de integração | § DOC-03 | P-PAY-ARCH-01 | Pesquisa oficial e Sandbox | Fontes datadas, logs Sandbox e ADR | Pendente |
| AUDIT-01 | Funcionalidades classificadas por estado real | docs/REPOSITORY_AUDIT.md | P-AUDIT-01 | Auditoria isolada | Inventário por recurso com arquivo e teste | Em andamento |
| BUILD-01 | Build, lint e TypeScript reproduzíveis | Roadmap | P-BUILD-01 | Execução técnica isolada | Logs reais vinculados ao SHA | Pendente; comandos não executados nesta sessão |

Os estados “APROVADO-CTO” indicam aprovação da regra, não conclusão de código. Nenhuma linha pode ser marcada validada sem teste/evidência real e revisão exigida.


| PAY-AS-01 | O desenho Asaas atende retenção evento + 72h e regra financeira? | FINANCIAL_RULES.md §8; BACKEND_ARCHITECTURE.md §19 | P-PAY-ARCH-01 | Avaliação oficial + Sandbox em execução autorizada futura | Documentação oficial datada, prova de fluxo de transferência, testes de saldo/estorno/split/chargeback e ADR | BLOQUEADO; Split padrão não permite data futura segundo FAQ oficial |
