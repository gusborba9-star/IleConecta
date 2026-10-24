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
| AUDIT-01 | Auditoria de ações administrativas e financeiras | BLUEPRINT §9; BACKEND §10 | P-OPS-01 | A definir | Nenhuma trilha formal localizada | Teste de eventos e controle de acesso | Ação crítica registra ator, motivo, recurso e horário | PROPOSTA-AGUARDA-CTO | Pendente |
| PRIV-01 | Minimização, retenção, exportação e exclusão de dados | BLUEPRINT §9 | P-ARCH-01 | A definir | Política formal não localizada | Testes de direitos/retention e revisão jurídica | Política aprovada e aplicada sem quebrar registros obrigatórios | BLOQUEADO | Pendente |
| NFR-BUILD-01 | Build e verificações estáticas reproduzíveis | ROADMAP P-TECH-01 | P-TECH-01 | EXEC-01 | package.json, vite.config.ts, package-lock.json; [PR #1](https://github.com/gusborba9-star/IleConecta/pull/1) | npm ci, build, lint, tsc -b com logs | Todos os comandos executam e falhas são resolvidas/documentadas | EM ANDAMENTO; testes não executados | Pendente |
| TEST-REG-01 | Testes de regressão para fluxos críticos | BLUEPRINT §11 | P-QA-01 | A definir | Suite de testes a inventariar | CI e resultados ligados ao SHA | Fluxos críticos passam após mudança | BLOQUEADO | Pendente |
| DEPLOY-PREVIEW-01 | Preview isolado e validado antes de produção | ROADMAP P-QA-01 | P-QA-01 | A definir | Vercel/CI não validado nesta DOC-02 | URL/commit Preview, E2E, logs e rollback de Preview | Preview corresponde ao SHA e não altera produção | BLOQUEADO | Pendente |
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

## Requisitos ainda sem cobertura/evidência

- Não foi recuperado um Blueprint anterior aprovado nem um Roadmap integral histórico.
- Não há IDs históricos de requisitos recuperados; os IDs nesta matriz foram criados nesta DOC-02.
- Não foram localizados critérios de aceitação aprovados, suite formal de testes ou ADRs.
- Não foi comprovado backend funcional, schema Supabase, autenticação segura, APIs, webhooks, ledger, conciliação ou repasses.
- Nenhum requisito está VALIDADO nesta matriz.
- EXEC-01 não tem evidência de execução dos comandos de build; EXEC-02 não foi iniciada.
