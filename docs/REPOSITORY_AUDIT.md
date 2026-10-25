# Ilê Conecta — Auditoria inicial do repositório e preparação para Vercel

> **Estado:** relatório técnico inicial; não é aprovação de produção.  
> **Base auditada:** `main` em `93e7060756b29d397b75f2151d870606a33b9692` (24/10/2026).  
> **Branch de trabalho:** `cto/repository-audit-vercel-foundation`.  
> **Regra:** nenhuma conclusão sobre produção é aceita sem comando executado, log ou teste reproduzível associado ao commit.

## 1. Decisão arquitetural inicial

**Manter Vite + React + TypeScript como frontend SPA**, salvo requisito funcional concreto descoberto na auditoria que exija SSR/Next.js. O repositório atual é um frontend React com React Router e não há evidência de que migrar para Next.js resolva um problema presente. Evitar migração de framework sem benefício demonstrado.

**Arquitetura-alvo proposta para aprovação:**
- Vercel: hospedagem do frontend estático, builds de branch/Preview e deploy de produção somente após aprovação.
- Supabase: Auth + PostgreSQL + Row Level Security para identidade e dados persistentes; Edge Functions para operações confiáveis e integração com provedores externos, se essa decisão for aprovada após revisar requisitos e limites.
- Asaas: integração exclusivamente server-side; segredo de API fora do bundle do navegador; webhooks autenticados, persistidos e processados com idempotência.
- Não conectar produção, criar schema real, cadastrar webhook de produção ou efetuar cobranças nesta fase.

## 2. Inventário observado em `main`

- 118 entradas na árvore Git, árvore não truncada.
- Projeto Vite/React/TypeScript, com `src/pages`, `src/components`, `src/contexts`, `src/lib`, `src/types`.
- Páginas identificadas: Feed, Discover, HousePage, Profile, Messages, Rituals, RitualDetail, Login, Register, Boost, Index e NotFound.
- UI baseada em React, React Router, Tailwind e componentes shadcn-style.
- Arquivos de configuração presentes: `vite.config.ts`, `package.json`, `package-lock.json`, `bun.lock`, `tsconfig*.json`, `eslint.config.js`, `tailwind.config.ts`.
- Não há diretório `supabase/`, migrations SQL ou Edge Functions no snapshot `main` consultado.
- Não há evidência nesta árvore de uma API própria `api/` ou `server/`.
- Os arquivos de arquitetura e roadmap encontrados na branch `doc-02/official-documentation-baseline` estão identificados como propostas não aprovadas; não devem ser tratados como baseline oficial até revisão.

## 3. Achados e riscos

### A-01 — Vite config divergente na main
`vite.config.ts` importa `@vitejs/plugin-react`, enquanto `package.json` declara `@vitejs/plugin-react-swc`. A branch `exec-01/fix-vite-build-vercel` já contém a correção do import e o commit `e780c7b327eee0b99c38f8191e0dafdd9d7b7e8c` produziu um Preview com build concluído. A correção ainda não está em `main`. **Ação:** transportar a correção para a branch de preparação e validar com instalação reproduzível; não fazer merge em `main` sem autorização.

### A-02 — Lockfiles concorrentes
Existem `package-lock.json` (npm) e `bun.lock` (Bun). O conjunto de dependências raiz registrado no `package-lock.json` não corresponde integralmente a `package.json` (por exemplo, várias dependências declaradas no manifesto não aparecem no bloco raiz do lock). O Preview reportou instalação via npm e build bem-sucedido, mas isso não prova que `npm ci` seja reproduzível. **Ação:** escolher npm como único gerenciador inicial por compatibilidade com o pipeline Vercel atual; executar `npm ci` em ambiente funcional, regenerar o lock somente com evidência e remover lock concorrente apenas em execução separada e revisada.

### A-03 — Protótipo, não backend operacional
`src/lib/storage.ts` usa `localStorage`; `src/lib/mockData.ts` fornece contas e dados fictícios; `src/contexts/AppContext.tsx` implementa fluxos locais. Login e cadastro consultam o contexto local. A tela de compra espera um timer e chama o estado local; declara explicitamente “Pagamento simulado no ambiente demo”. Portanto, UI, login, reservas e compra não comprovam persistência multiusuário, autenticação real ou pagamento.

### A-04 — Credenciais fictícias incluídas no bundle
Os dados de demonstração contêm senhas simples de contas fictícias. Remover ou isolar essas credenciais antes de qualquer uso público real; nunca reaproveitar como usuários de produção.

### A-05 — Regras financeiras não consolidadas
O modelo de demonstração usa percentuais de comissão diferentes. Eles não podem ser usados para cobrar, calcular repasse ou alimentar o Asaas. Definir regras comerciais e contábeis aprovadas, snapshots de preço, ledger/reconciliação, cancelamentos, reembolsos e política de repasse antes de pagamentos reais.

### A-06 — Integrações declaradas não equivalem a integrações funcionais
`package.json` inclui SDKs de Supabase e Stripe, mas isso não comprova projeto Supabase, schema, Auth, políticas RLS, Edge Functions ou fluxo de pagamento ativo. O Asaas ainda precisa de um adaptador de backend próprio; nunca chamar API autenticada do Asaas diretamente do navegador.

### A-07 — Verificações locais ainda pendentes
Não há resultado local confiável nesta auditoria para `npm ci`, `npm run build`, `npm run lint` e `npx tsc -b`. O Preview de `e780c7b` confirma build remoto bem-sucedido, não lint, testes, typecheck ou funcionamento de rotas.

## 4. Critérios mínimos de preparação Vercel

1. Uma branch versionada contém a correção do plugin Vite.
2. Um único gerenciador de pacotes é documentado; lockfile consistente e `npm ci` comprovado.
3. `npm run build`, `npm run lint` e `npx tsc -b` têm saídas reais registradas; corrigir ou justificar erros.
4. As rotas SPA são verificadas, incluindo fallback de refresh para rotas internas.
5. Nenhum segredo de Asaas/Supabase é incluído em arquivos versionados ou variáveis `VITE_*` que vão para o cliente.
6. Vercel recebe apenas configuração mínima de build; variáveis de ambiente são adicionadas somente quando o código que as utiliza estiver implementado e revisado.
7. Não promover para produção nem alterar `main` sem autorização explícita do CTO.

## 5. Sequência de execução proposta

- **AUDIT-01:** revisar todos os módulos de frontend, imports, navegação, estado, dados mock, persistência, segurança e acessibilidade; classificar código utilizável, incompleto e a substituir.
- **DOC-01:** revisar a proposta de BLUEPRINT/ROADMAP já existente na branch documental e reconciliar com o código observado e decisões do CTO.
- **BUILD-01:** corrigir plugin e lockfile em branch dedicada; executar os quatro comandos e testes de rotas.
- **ARCH-01:** aprovar contratos, modelo de dados, autenticação, autorização, RLS, migrações e fronteiras de backend.
- **PAY-01:** implementar Asaas em Sandbox por função server-side; idempotência, verificação de webhook, conciliação e testes negativos. Não habilitar produção.
- **INFRA-01:** criar/conectar um único projeto Vercel ao repositório e configurar Supabase após a auditoria e arquitetura aprovadas.
- **RELEASE-01:** só depois dos critérios anteriores, validar Preview completo e pedir autorização separada de produção.

## 6. Exclusão dos projetos Vercel antigos

A conta conectada lista os projetos `ile-conecta`, `ile-conecta-tdfx`, `ile-conecta-9qfn` e `ile-conecta-validation`, mas as consultas detalhadas individuais retornam `404 Project not found` apesar de aparecerem na listagem. A integração não conseguiu gerar links de exclusão para esses recursos. Nenhuma exclusão foi executada por esta auditoria. A exclusão deve ser confirmada no painel da Vercel, no contexto de equipe correto; apagar um projeto remove seus deployments, variáveis e configurações associadas.

## 7. Fontes e evidências

- `main`: `93e7060756b29d397b75f2151d870606a33b9692`.
- Preview de build remoto: branch `exec-01/fix-vite-build-vercel`, commit `e780c7b327eee0b99c38f8191e0dafdd9d7b7e8c`.
- `package.json` blob SHA `e56203cb233cc6a1f3d8895aad6696b2221c2eb3`.
- `package-lock.json` blob SHA `b08705f0b2153182d12d2747241fc70589d1a95f`.
- `vite.config.ts` em `main` contém o import divergente descrito em A-01.
- Documentação oficial de exclusão de projeto Vercel: https://vercel.com/docs/projects/managing-projects.
- Documentação oficial Asaas: https://docs.asaas.com/docs/visao-geral e https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook.


## 8. Auditoria funcional e de segurança — DOC-03 (snapshot `main` 93e7060756b29d397b75f2151d870606a33b9692)

### 8.1 Classificação por funcionalidade observada

| Área | Evidência de código | Classificação | Risco / próximo critério |
|---|---|---|---|
| Login/logout | `src/contexts/AppContext.tsx`; login compara email/senha em objetos locais e grava ID em `localStorage` | Simulado/local; autenticação real inexistente no snapshot | Não é barreira de segurança. Implementar provedor server-side e testes de sessão/revogação antes de uso real. |
| Cadastro | `AppContext.register` cria objeto no estado React e inclui a senha em texto simples | Local; sem persistência de servidor | Não aceita identidade confiável nem valida unicidade/abuso no backend. |
| Persistência | `src/lib/storage.ts` usa `localStorage`; falhas de gravação são ignoradas | Local no dispositivo | Sem sincronização multiusuário, backup, integridade ou controle server-side. |
| Feed/posts/stories/likes/comentários | `AppContext` atualiza arrays locais e salva no browser | Simulado/local | Sem API, autorização de recurso, moderação ou persistência central. |
| Casas/perfis/descoberta | Dados iniciais vêm de `src/lib/mockData.ts`; contexto fornece acesso local | Simulado com dados fictícios | Não comprova cadastro real, verificação de casa ou fonte persistente. |
| Mensagens | Conversas e mensagens são atualizadas em estado local | Simulado/local | Sem entrega entre dispositivos, autorização server-side ou proteção de conteúdo. |
| Reserva/compra de ritual | `src/components/ritual/RitualPurchaseModal.tsx` usa timer local, chama `buyRitual` e declara “Pagamento simulado no ambiente demo” | Simulada; sem provedor real | Não cobrar nem anunciar confirmação financeira real; capacidade/vagas não são transacionais no servidor. |
| Comissão e repasse | O protótipo não deve calcular nem exibir divisão financeira como real; percentuais fictícios removidos do modelo local nesta correção | Não implementado; sem ledger, cobrança ou provedor | A implementação financeira futura deve seguir FIN-D03-01–FIN-D03-11, com centavos inteiros, ledger, idempotência e autorização específica. |
| Boost/destaque | Atualizações locais no contexto; a interface agora ignora boosts expirados | Simulado/local | Sem cobrança ou autorização server-side; a expiração corrigida vale apenas para o estado local do navegador. |
| Rotas protegidas | `src/App.tsx` usa componente `Protected` baseado em `currentUser` no frontend | Proteção de navegação somente | Não equivale a autorização; todo acesso a dados sensíveis precisa ser validado no servidor. |
| Backend/API/banco | Nenhuma API própria, migrations Supabase ou Edge Functions foi confirmada no snapshot examinado | Não localizado nesta árvore | Não declarar backend operacional; validar em nova inspeção quando arquitetura for aprovada. |
| Acessibilidade/responsividade e console | Não executados em navegador automatizado nesta sessão | Não validado | Requer smoke tests em viewport móvel/desktop, console sem erros, teclado, foco e leitores de tela. |

### 8.2 Achados priorizados

#### AUD-SEC-01 — Senhas em texto simples no estado e armazenamento local (ALTO / bloqueador de lançamento)
O cadastro inclui `password` no objeto do usuário; o estado é persistido por `saveKey("users", users)` em `localStorage`; o login compara a senha diretamente. O arquivo `src/lib/mockData.ts` também contém senhas simples para contas fictícias. Isso é evidência de um fluxo de demonstração, não de autenticação segura. Não reutilizar contas fictícias nem credenciais de usuários reais nesse protótipo. Antes de uso público real, substituir por autenticação server-side, remover persistência de senha no cliente e adicionar testes de sessão, revogação e isolamento.

#### AUD-SEC-02 — Autorização apenas no frontend (ALTO / bloqueador de lançamento)
O componente `Protected` só decide a navegação com base em estado local; o contexto guarda dados e mutações no browser. Um usuário pode manipular o cliente/armazenamento. Nenhuma regra de autorização server-side foi comprovada. Não usar isso como controle de acesso a dados ou operações reais.

#### AUD-FIN-01 — Compra e cálculo financeiro simulados (ALTO / bloqueador financeiro)
O modal declara pagamento simulado, usa atraso artificial e calcula valores com `platformFeePct` por ponto flutuante. A ordem DOC-03 aprova 17%/83% sobre bruto, taxas do provedor absorvidas pela plataforma e retenção de 72h após evento. Não alterar para pagamento real nesta execução. Criar implementação financeira separada, em centavos inteiros, com ledger, idempotência, reconciliação e testes após autorização específica.

#### AUD-BUILD-01 — Lockfile npm incompatível com o manifesto (ALTO / bloqueador de reprodutibilidade)
Comparação estática de `package.json` (blob `e56203cb233cc6a1f3d8895aad6696b2221c2eb3`) e `package-lock.json` (blob `b08705f0b2153182d12d2747241fc70589d1a95f`) encontrou **27 dependências declaradas em `package.json` ausentes do bloco raiz `packages[""].dependencies` do lockfile**. Exemplos: `@supabase/supabase-js`, `@stripe/stripe-js`, `axios`, `framer-motion`, `leaflet`, `xlsx`, `zustand`. Nenhuma dependência extra foi identificada no bloco raiz do lockfile nesta comparação. `npm ci` não foi executado; portanto, não declarar falha de instalação como resultado observado. Prioridade: escolher npm como gerenciador de referência, reproduzir a instalação em ambiente funcional e atualizar o lockfile somente com saída real e diff revisado. `bun.lock` também está presente, caracterizando dois lockfiles ativos; sua remoção fica pendente de decisão e revisão separada.

#### AUD-BUILD-02 — Import do plugin Vite incompatível na main (ALTO)
Em `main`, `vite.config.ts` importa `@vitejs/plugin-react`, enquanto `package.json` declara `@vitejs/plugin-react-swc`. A correção isolada para SWC está na branch `cto/repository-audit-vercel-foundation` e nesta PR. Ainda não há nesta execução evidência de build local reproduzível, lint ou typecheck.

#### AUD-DEP-01 — Inventário de dependências e vulnerabilidades não executado (MÉDIO / pendente)
A presença de SDKs de Supabase/Stripe em `package.json` não comprova integração. `npm audit`, análise de licença e revisão de dependências transitivas não foram executados; não atribuir status “sem vulnerabilidades”. O lockfile referencia `registry.npmmirror.com` para pacotes; revisar política de registry e proveniência durante a instalação reproduzível.

#### AUD-QA-01 — Cobertura automatizada e rotas não comprovadas (MÉDIO)
O manifesto define scripts `build`, `lint` e `preview`, mas não define script de testes. Nenhuma suíte automatizada foi confirmada/executada nesta sessão. `npx tsc -b` também não foi executado. Planejar testes unitários para cálculos/estados, testes de autorização no backend futuro e smoke tests de rotas SPA/refresh.

### 8.3 Resultados de execução — linha do tempo

A tabela original desta seção descrevia apenas a inspeção estática, antes da execução CI subsequente. Os resultados atualizados e reproduzíveis estão em §9, com comandos executados em GitHub Actions. Não interpretar os estados iniciais abaixo como resultado final.

| Verificação | Estado na inspeção estática inicial | Estado após CI |
|---|---|---|
| Comparação estática package.json/package-lock.json | Executada; 27 dependências ausentes do bloco raiz | Confirmada por `npm ci` falhar com EUSAGE e listar pacotes ausentes/desalinhados |
| `npm ci` | Não executado ainda | **FALHOU**; veja §9 |
| `npm run build` | Não executado ainda | **PASSOU somente após instalação diagnóstica**; veja §9 |
| `npm run lint` | Não executado ainda | **FALHOU**; 24 erros e 8 avisos |
| `npx tsc -b` | Não executado ainda | **PASSOU após instalação diagnóstica** |
| `npm audit --omit=dev` | Não executado ainda | **FALHOU**; 16 vulnerabilidades relatadas |
| Navegação/refresh e inspeção de console em navegador | Não executado | Não executado |
| Testes de autenticação/autorização, persistência multiusuário ou pagamentos | Não executado | Não executado |

### 8.4 Plano de estabilização sem ampliação de escopo

1. Manter a correção do import Vite nesta branch isolada, sem merge.
2. Em ambiente de execução funcional, registrar Node/npm, SHA exato e saída completa de `npm ci`, build, lint, TypeScript e auditoria de dependências.
3. Corrigir o lockfile apenas após reproduzir a inconsistência e revisar o diff; escolher um gerenciador principal. Não apagar `bun.lock` sem revisão específica.
4. Criar testes para cálculos monetários em centavos e máquina de estados apenas na execução financeira autorizada; não conectar provedor nesta etapa.
5. Registrar evidência de navegação/refresh, responsividade, acessibilidade e console quando houver navegador de teste.
6. Não declarar o produto operacional enquanto autenticação, autorização e persistência forem locais/simuladas.


## 9. Execução CI real — workflow audit (2026-10-25)

**Run #1 (workflow inicial, status geral enganoso por continue-on-error):** [GitHub Actions — Repository audit](https://github.com/gusborba9-star/IleConecta/actions/runs/40221235100)  
**Branch HEAD testada:** `ba5945b1d71c44c4cb9e6ce04eb3569e49e886be`  
**Merge ref efetivamente checkout:** `8f04b4a1a9fb0713e11706b0c34ebc29ff7898c3`  
**Ambiente:** Ubuntu 24.04; Node `v20.20.2`; npm `10.8.2`.  
**Run #2 (workflow corrigido, falha agregada conforme esperado):** [GitHub Actions — Repository audit](https://github.com/gusborba9-star/IleConecta/actions/runs/40221406756), branch HEAD `19c41e34f5ef8212741342e8a477ce89cd2e62ff`, merge ref checkoutada pelo runner; conclusão geral `failure` porque npm ci, lint e audit falharam.

> O run #1 usou `continue-on-error` em verificações individuais, portanto o estado geral do job ficou `success` apesar de falhas nos comandos. Isso foi identificado e o workflow foi corrigido para falhar explicitamente se qualquer verificação obrigatória falhar. O estado geral do run #1 **não** significa aprovação do build, lint ou auditoria de dependências.

| Comando | Resultado real | Evidência / interpretação |
|---|---|---|
| `npm ci` | **FALHOU — EUSAGE, exit code 1** | npm informou que `package.json` e `package-lock.json` não estão sincronizados. Listou pacotes ausentes do lock e uma versão inválida de `@tanstack/react-query`. |
| `npm install --no-audit --no-fund` | **PASSOU como instalação diagnóstica** | Instalou 595 pacotes em 47s no runner. O lockfile gerado ficou apenas no workspace efêmero; não foi automaticamente aplicado à branch. |
| `npm run build` | **PASSOU após a instalação diagnóstica** | Vite 5.4.19; 1.609 módulos transformados; build concluído em 3,15s. Não é prova de build a partir de instalação limpa do lock versionado. Browserslist/caniuse-lite desatualizado foi avisado. |
| `npm run lint` | **FALHOU — exit code 1** | 32 problemas: 24 erros e 8 avisos. Entre os erros: `no-explicit-any` em vários componentes/páginas, bloco vazio em `src/lib/storage.ts:16` e hooks `useMemo` condicionais em `src/pages/HousePage.tsx:25–26`. |
| `npx tsc -b` | **PASSOU na instalação diagnóstica** | O comando terminou sem saída de erro e o workflow avançou ao próximo passo. Não equivale a instalação limpa. |
| `npm audit --omit=dev` | **FALHOU — exit code 1** | 16 vulnerabilidades na árvore analisada: 2 moderadas, 13 altas e 1 crítica. |

### 9.1 Vulnerabilidades de dependências — bloqueador de segurança

O relatório de `npm audit --omit=dev` identificou avisos envolvendo, entre outras, `@remix-run/router`/React Router (alto), `brace-expansion` (alto), `glob` (alto), `jspdf` (crítico), `lodash` (alto), `minimatch` (alto), `nanoid` (alto), `picomatch` (alto), `postcss` (alto), `postcss-selector-parser` (moderado), `source-map-js` (alto), `xlsx` (alto, sem correção reportada pelo audit), `yaml` (moderado) e `zod` (alto). A saída recomenda `npm audit fix` para parte dos itens; para jsPDF e Zod, a correção automática sugerida exigiria `--force` e mudança de versão potencialmente incompatível.

Nenhum `npm audit fix` ou `--force` foi executado. Próxima ação: avaliar dependências diretas/transitivas, uso real dos pacotes, versões corrigidas e compatibilidade; separar atualizações de baixo risco das mudanças breaking. Não tratar o número de advisories como prova de exploração no produto, mas bloquear lançamento até triagem e plano de remediação revisado.

### 9.2 Próximas correções sustentadas pelas evidências

1. Regenerar e revisar `package-lock.json` em branch isolada usando npm 10/Node 20, comparar o diff e confirmar que `npm ci` passa no commit resultante. `bun.lock` permanece preservado até decisão explícita sobre gerenciador único.
2. Corrigir os erros de lint em mudanças pequenas, sem desativar regras globalmente; resolver primeiro o uso condicional de hooks e os blocos vazios.
3. Tratar vulnerabilidades por pacote, priorizando a crítica em jsPDF e as altas em React Router, xlsx e demais dependências, com testes de regressão e sem `--force` indiscriminado.
4. Reexecutar build, lint, TypeScript e audit a partir do lockfile corrigido e registrar SHA/logs.
5. Executar testes de rotas/refresh, console, acessibilidade e responsividade; não foram executados no run #1.

### 9.3 Estado honesto da execução

- O build foi comprovado apenas após `npm install` diagnóstico, não via `npm ci`.
- Lint e audit de produção falharam.
- TypeScript passou após a instalação diagnóstica.
- Nenhum teste funcional em navegador, teste de isolamento/autorização, teste multiusuário, Sandbox Asaas ou teste de retenção de 72h foi executado.
- O workflow atualizado registra os resultados em resumo e falha o job se qualquer verificação obrigatória falhar. O run #2 confirmou que o gate final sinaliza a falha; foi produzido o artefato `diagnostic-package-lock` para revisão, mas o lockfile versionado não foi alterado nesta etapa.


## 10. Segunda passagem de estabilização de lint — 2026-10-25

**Run #3:** [GitHub Actions — Repository audit](https://github.com/gusborba9-star/IleConecta/actions/runs/40221726102)  
Branch HEAD testada: `4297af0adc734e74c0cf0458fbd4246383851782`; merge ref checkoutada: `99c802cc0c5af3ef6c36e69f56404d4464f136a1`.

### Correções implementadas na branch isolada

- `src/pages/HousePage.tsx`: moveu cálculos antes do early return e removeu chamadas condicionais de `useMemo`, corrigindo violação das Rules of Hooks.
- Substituiu usos de `any` por tipos explícitos nos componentes de feed, stories, rails, navegação, boost, descoberta, mensagens, perfil, cadastro e detalhe de ritual.
- `src/lib/storage.ts`: documentou o catch de persistência best-effort, eliminando bloco vazio.
- `src/components/ui/command.tsx` e `src/components/ui/textarea.tsx`: substituiu interfaces vazias por aliases de tipo equivalentes.
- Nenhuma regra ESLint foi desabilitada globalmente; nenhum lockfile foi alterado.

### Resultados CI no merge ref

| Comando | Resultado no Run #3 |
|---|---|
| `npm ci` | **FALHOU** por divergência entre manifesto e lockfile; instalação diagnóstica executada depois |
| `npm install --no-audit --no-fund` | PASSOU como fallback diagnóstico; 595 pacotes instalados |
| `npm run build` | PASSOU; Vite 5.4.19, 1.609 módulos, build em 3,15s |
| `npm run lint` | PASSOU sem erros; restam 8 avisos de Fast Refresh/exportação mista |
| `npx tsc -b` | PASSOU após instalação diagnóstica |
| `npm audit --omit=dev` | FALHOU; 16 vulnerabilidades: 2 moderadas, 13 altas e 1 crítica |
| Gate final do workflow | **FALHOU corretamente** por `npm ci` e `npm audit`; lint não bloqueia mais |

O Run #3 ainda antecede a última alteração de concorrência do workflow; uma nova execução na revisão atual deve confirmar o mesmo estado. O lockfile diagnóstico foi enviado como artefato para revisão, mas a versão versionada continua sem correção. Não declarar estabilização concluída até `npm ci` passar com lockfile versionado e a triagem de vulnerabilidades ser concluída.


## 11. Verificação final da revisão atual — 2026-10-25

**Run #4:** [GitHub Actions — Repository audit](https://github.com/gusborba9-star/IleConecta/actions/runs/40221827927)  
Branch HEAD: `ac72b717b3a28c7511991389cb406ffb856527b5`; merge ref testada: `b7ecc06fde40255cad2d3ec200c1777657ed41a5`. Node `v20.20.2`, npm `10.8.2`, Ubuntu 24.04.

| Comando | Resultado observado |
|---|---|
| `npm ci` | **FALHOU — EUSAGE**; continuam ausentes do lockfile dependências declaradas no manifesto, incluindo `@google/generative-ai`, `@react-three/drei`, `@stripe/stripe-js`, `@supabase/supabase-js` e outras; também foi reportada versão desalinhada de `@tanstack/react-query`. |
| `npm install --no-audit --no-fund` | PASSOU como fallback diagnóstico; o artefato `diagnostic-package-lock` foi produzido para revisão. |
| `npm run build` | **PASSOU após fallback**; 1.609 módulos transformados, build em 2,44s. Browserslist/caniuse-lite continua desatualizado. |
| `npm run lint` | **PASSOU sem erros**; restam 8 avisos de Fast Refresh/exportação mista. |
| `npx tsc -b` | **PASSOU após fallback**; não foram observados erros de TypeScript. |
| `npm audit --omit=dev` | **FALHOU**; 16 vulnerabilidades (2 moderadas, 13 altas, 1 crítica). |
| Gate final | **FALHOU corretamente** porque `npm ci` e audit não passaram. |

A revisão atual confirma que as correções de lint eliminaram os 24 erros anteriores. Ainda não é possível declarar a instalação reproduzível nem o repositório pronto para lançamento: o lockfile versionado não foi substituído, e as vulnerabilidades não foram remediadas. Nenhuma alteração foi mesclada à `main`.


## 12. Busca direcionada por segredos — limite da evidência

Consultas direcionadas no código da branch `main` por padrões/nomeações `asaas api key`, `SUPABASE_SERVICE_ROLE_KEY`, `sk_live` e `secret_key` não retornaram correspondências na busca GitHub usada. Isso **não é uma varredura completa de segredos** e não permite afirmar que o repositório esteja livre de credenciais. Não foi executado scanner dedicado (por exemplo, secret scanning/Gitleaks) nem auditoria de histórico completo.

Foi comprovado que o fluxo de demonstração guarda senhas de contas no estado local e `localStorage`; isso é distinto de encontrar uma chave de API real, mas impede usar esse fluxo com credenciais reais. Antes de lançamento, executar secret scanning sobre árvore e histórico, revisar arquivos de ambiente e rotacionar qualquer segredo real caso seja encontrado. Nenhum token ou valor de credencial foi incluído neste relatório.


## 13. Correção reproduzível do lockfile e nova triagem de vulnerabilidades — 2026-10-25

Esta seção **substitui o estado anterior** das seções 10–11 quanto ao lockfile e à contagem de vulnerabilidades. Os SHA citados nas seções históricas são commits de CI antigos, não necessariamente o head atual da PR.

### Lockfile e estratégia de gerenciador

- Commit de sincronização do lockfile: [49eaf46](https://github.com/gusborba9-star/IleConecta/commit/49eaf46a07d2c8496d4361dd283aeea116aae167). Executado `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` com Node `v20.20.2` e npm `10.8.2`; o diff regenerou o lockfile para refletir o manifesto.
- Remediação não-breaking do lockfile: [78658f4](https://github.com/gusborba9-star/IleConecta/commit/78658f44e74ccb827ce56dcddba6b7a13839ad33), com `npm audit fix --package-lock-only --ignore-scripts --no-fund`, sem `--force`.
- Dependências diretas removidas de `package.json` e do lockfile: `jspdf` (`^3.0.3`), `xlsx` (`^0.18.5`) e `zod` (`^3.23.8`). A inspeção dos arquivos TypeScript/TSX e configurações verificadas não encontrou imports/uso dessas bibliotecas. A remoção elimina o jsPDF crítico, o xlsx de alta gravidade sem correção publicada no relatório e o Zod que exigia major para a correção; reintroduzir qualquer uma exige caso de uso confirmado e nova triagem.
- `bun.lock` foi preservado sem alterações. A estratégia de gerenciador único continua pendente de decisão formal.
- Os workflows temporários usados para sincronizar o lockfile e aplicar correções não-breaking foram removidos da branch após a execução; não fazem parte da entrega final.

### CI reproduzível após correção

**Run #8:** [GitHub Actions — Repository audit](https://github.com/gusborba9-star/IleConecta/actions/runs/40224931236)  
Node `v20.20.2`; npm `10.8.2`; Ubuntu runner. A PR #3 head observado para esta execução era `2cebabc313976235a44122351537fa61d8534669`; o workflow fez checkout da merge ref `2d0b458f62d21e65513a63ecbfc57a4e4324d6b9` e executou as verificações no mesmo ambiente. O SHA atual da PR deve sempre ser confirmado diretamente no GitHub, pois este relatório também recebe commits documentais.

| Verificação | Resultado observado |
|---|---|
| `npm ci` | **PASSOU** sem fallback diagnóstico |
| `npm run build` | **PASSOU**, Vite build em 2,17 s |
| `npm run lint` | **PASSOU**, 0 erros e 8 avisos de Fast Refresh/exportações mistas |
| `npx tsc -b` | **PASSOU** |
| Inventário completo de advisories | PASSOU como etapa de coleta; relatório JSON anexado como artefato |
| `npm audit --omit=dev` | **FALHOU** por 6 vulnerabilidades moderadas remanescentes |
| Gate final | **FALHOU corretamente** por auditoria de dependências; instalação, build, lint e TypeScript passaram |

Artefato JSON completo: [full-dependency-audit](https://github.com/gusborba9-star/IleConecta/actions/runs/40224931236/artifacts/12610792196).

### Resultado da triagem

Antes da remediação, o inventário registrava 16 vulnerabilidades (2 moderadas, 13 altas, 1 crítica). Após remover dependências diretas não utilizadas e aplicar correções não-breaking, o inventário completo atual registra **9 entradas de vulnerabilidade: 8 moderadas, 1 alta e 0 críticas**. A auditoria de produção `npm audit --omit=dev` registra 6 moderadas, sem alta ou crítica nessa seleção.

| Pacote / cadeia | Gravidade reportada | Correção disponível e avaliação |
|---|---|---|
| `vite` / `esbuild` / `launch-editor` | Alta no inventário completo; advisories adicionais moderados | npm indica Vite `8.3.5`, mudança major desde Vite 5. Não migrar sem avaliação de compatibilidade com plugin SWC, configuração Vite, build e ambiente. É risco remanescente de tooling/desenvolvimento; manter explícito, não ignorar. |
| `react-router-dom` / `react-router` | Moderada | Correção sugerida é `7.18.4`, major desde Router 6. O app usa `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Link`, `NavLink`, `useNavigate`, `useParams` e `Outlet`. A compatibilidade precisa de atualização isolada e testes de navegação/refresh antes de aceitar a major. |
| `tailwindcss`, `@tailwindcss/typography`, `tailwindcss-animate`, `postcss-nested`, `postcss-selector-parser` | Moderada | O relatório atual não oferece correção segura completa para `postcss-selector-parser <7.1.6`; há cadeias transientes ligadas a Tailwind 3. Não aplicar override arbitrário sem verificar compatibilidade dos plugins. Avaliar upgrade compatível ou migração Tailwind separada. |

Advisories relevantes no relatório:
- Vite: [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) e [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
- React Router: [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) e [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg).
- PostCSS selector parser: [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

### Decisões ainda necessárias

1. Aprovar ou rejeitar uma execução isolada para migrar Vite 5 → Vite 8, com atualização compatível de plugin/configuração e testes.
2. Aprovar ou rejeitar uma execução isolada para React Router 6 → 7, com teste de todas as rotas e refresh direto.
3. Definir abordagem para a cadeia Tailwind/PostCSS sem override inseguro.
4. Formalizar a estratégia npm/Bun; até lá, `bun.lock` permanece intacto.

### Estado honesto após a remediação

A instalação limpa reproduzível foi demonstrada. Build, lint e TypeScript passaram no mesmo runner e na mesma execução. A auditoria de dependências continua com riscos moderados e um advisory alto no inventário completo relacionado ao tooling Vite. Por isso, a PR é **apresentável para revisão do CTO, mas não é declarada livre de vulnerabilidades nem pronta para lançamento**. Nenhuma PR foi mesclada e nenhuma infraestrutura/integração financeira foi configurada.


## 14. Correção integrada de fluxos locais — branch `fix/integrated-demo-flows`

Esta entrega corrige inconsistências de comportamento no protótipo sem declarar o produto operacional e sem iniciar backend, infraestrutura ou pagamentos reais.

- Cadastro local: e-mail normalizado e duplicidades detectadas antes de criar uma conta demonstrativa.
- Mensagens: removido o temporizador que criava uma mensagem vazia para o próprio usuário; envio agora rejeita texto vazio, destinatário inexistente e autoenvio, e atualiza conversas com setter funcional para reduzir perda de atualização por estado obsoleto.
- Busca: a busca do cabeçalho navega para Descobrir e aplica o termo na filtragem.
- Impulsionamento: os componentes de descoberta, página da casa e trilho lateral só consideram ativo um boost cuja expiração ainda não passou.
- Reserva/financeiro: removidos percentuais fictícios do modelo de ritual e do cálculo local; o fluxo é identificado como simulação e não afirma que houve pagamento, notificação à casa ou reserva real.
- Ações sem implementação: controles identificados como indisponíveis foram desabilitados em vez de parecerem operações concluídas.
- Aviso global e avisos de autenticação esclarecem que o estado é local, não há autenticação server-side nem sincronização entre usuários e não se devem inserir credenciais reais.

**Limite de segurança:** contas e senhas ainda fazem parte do modelo local de demonstração. O aviso reduz o risco de uso indevido, mas não substitui a implementação autorizada de identidade e autorização server-side. Nenhuma credencial real deve ser usada.

**Validação CI no SHA `7ed07cdd62a0dc493919979cd8712ba029260a90`:** [Run #30](https://github.com/gusborba9-star/IleConecta/actions/runs/40229989125). `npm ci` passou; build passou em 3,30 s; lint passou com 0 erros e 8 avisos; `npx tsc -b` passou; `npm test` passou em 5/5 testes de domínio. O gate final falhou exclusivamente porque `npm audit --omit=dev` encontrou 6 vulnerabilidades moderadas: cadeia `postcss-selector-parser` e React Router 6. O inventário completo permanece em 9 entradas (8 moderadas, 1 alta, 0 críticas). Nenhum teste de navegador/E2E foi executado; busca, mensagens, expiração e reserva ainda precisam de validação de ponta a ponta. O SHA de CI é o commit testado; uma atualização documental posterior exige nova execução para afirmar validação do HEAD mais recente.


## 15. Segunda entrega integrada — ciclo de simulação de reserva

Revisão focada no caminho `Rituais → Detalhe → Modal → AppContext → Perfil`.

### Causa raiz
A regra de elegibilidade para simular reserva estava distribuída entre a tela e o contexto. O contexto aceitava qualquer tipo de conta e não verificava se o evento já havia começado; a interface só bloqueava vagas esgotadas. O modal também usava um temporizador artificial para executar uma operação síncrona, aumentando a complexidade e mantendo estado de conclusão ao reabrir.

### Correção
- Adicionada a função de domínio `canReserveDemoRitual`, compartilhada entre detalhe, modal e contexto.
- A simulação agora exige conta do tipo `personal`, data válida no futuro e pelo menos uma vaga disponível.
- O contexto revalida a elegibilidade antes de gravar a simulação, em vez de confiar apenas no botão da interface.
- Removido o temporizador artificial; a operação local é síncrona e o modal reinicia o estado de conclusão ao abrir uma nova simulação.
- Adicionados testes de domínio para perfil comercial, ausência de perfil, evento passado, data inválida e ausência de vagas.

### Limites
A reserva continua sendo apenas um registro local; a regra não oferece bloqueio transacional, reserva de vaga concorrente, sincronização entre abas/usuários ou confirmação real. Esses comportamentos exigem backend e não são simulados como se existissem.

### Validação CI no SHA `4c5be44bdb0f6f42039db5c0d18f1b4264f3eace`
[Run #32](https://github.com/gusborba9-star/IleConecta/actions/runs/40232069665). `npm ci`, build (2,08 s), lint (0 erros; 8 avisos), `npx tsc -b` e 6/6 testes de domínio passaram. `npm audit --omit=dev` encontrou 6 vulnerabilidades moderadas e manteve o gate geral em falha. Testes de navegador ainda não foram executados.


## 16. Terceira entrega integrada — descoberta global e navegação

### Causa raiz
O campo global anunciava busca por casas, rituais e orixás, mas encaminhava todas as consultas para um filtro que só examinava nome/cidade de casas. Além disso, a comparação não ignorava acentos e a tela podia exibir um estado vazio de casas mesmo quando havia rituais correspondentes. A página de login também navegava durante a renderização, e o botão de criar story não executava nenhuma ação.

### Correção
- A busca de Descobrir agora compara nome, cidade, estado, categoria, descrição e tags de casas e compara título, descrição, categoria e casa responsável dos rituais.
- Normalização de busca remove diacríticos e espaços extras, permitindo consultas como `sao paulo` e `xango`.
- O estado vazio global só aparece quando não há casas nem rituais correspondentes.
- O redirecionamento da página de login foi movido para `useEffect`, evitando navegação como efeito colateral do render.
- O botão de stories sem implementação foi desabilitado e identificado.
- Publicações de pessoas deixam de usar links `#` que provocavam navegação para o topo; a própria publicação pode levar ao perfil do autor, quando disponível.
- Foram adicionados testes de normalização e correspondência de busca.

### Validação CI no SHA `90c248b2447a00ab43d50a06475fecbca5e6c26f`
[Run #34](https://github.com/gusborba9-star/IleConecta/actions/runs/40232438763):
- `npm ci`: PASS.
- Build: PASS, 3,26 s.
- Lint: PASS, 0 erros e 8 avisos.
- TypeScript: PASS.
- Testes de domínio: PASS, 7/7.
- `npm audit --omit=dev`: FAIL, 6 vulnerabilidades moderadas; gate geral FAIL.

### Limites
Não foi executado teste de navegador. A busca foi validada por função de domínio e build, não por interação real de rota/campo. A navegação login → feed, stories desabilitados, criação de publicação, curtidas/comentários, persistência após recarga e layout responsivo continuam sem prova E2E.


## 17. Quarta entrega integrada — integridade de referências no perfil

### Causa raiz
A lista de reservas demonstrativas em `Profile.tsx` usava uma asserção de não-nulidade para localizar o ritual (`rituals.find(...)!`). Como o estado é persistido localmente e pode sobreviver a mudanças de dados/versão, uma reserva antiga sem ritual correspondente poderia provocar erro de renderização e quebrar a página de perfil.

### Correção
- A lista agora trata explicitamente a ausência do ritual e renderiza um registro residual sem tentar acessar propriedades inexistentes.
- A ausência da casa responsável também é tratada sem gerar rota `/mensagens/undefined`.
- O valor e a data do registro local são preservados como histórico demonstrativo, sem alegar que a reserva continua válida.

### Validação CI no SHA `60468827811b04bf73b814df107e074ce7071a76`
[Run #36](https://github.com/gusborba9-star/IleConecta/actions/runs/40232827299):
- `npm ci`: PASS.
- Build: PASS, 3,24 s.
- Lint: PASS, 0 erros e 8 avisos.
- TypeScript: PASS.
- Testes de domínio: PASS, 7/7.
- `npm audit --omit=dev`: FAIL, 6 vulnerabilidades moderadas; gate geral FAIL.

### Limites
A correção evita o crash de renderização para uma referência ausente, mas não adiciona validação de esquema completa a `localStorage`. Dados persistidos malformados, migração de versões, quota, armazenamento indisponível e sincronização entre abas continuam sem testes de integração.


## 18. Validação integrada — persistência, navegador, UI compartilhada e dependências

### Persistência: causas e correções
- `src/lib/storage.ts` agora delega a `src/lib/storageCore.js`: JSON inválido ou incompatível com o esquema retorna fallback seguro, guarda uma cópia de recuperação quando possível e remove a chave inválida do caminho de leitura.
- `saveKey` e `clearAll` retornam sucesso/falha em vez de ocultar o resultado. `AppContext` registra aviso quando uma gravação não funciona.
- `src/lib/persistedState.js` valida estrutura e relações entre usuários, casas, rituais, publicações, stories, conversas, mensagens, reservas e sessão. IDs órfãos e duplicados fazem o registro persistido ser rejeitado, evitando que referências inválidas entrem no estado ativo.
- Testes adicionados: `tests/storage.test.mjs`, `tests/persisted-state.test.mjs` e `tests/security-floor.test.mjs`.

### Fluxos reais de navegador
- `playwright.config.mjs` fixa a configuração e usa servidor Vite local, sem configurar serviços de produção.
- `tests/e2e/flows.spec.mjs` cobre nove cenários com recarga: cadastro/sessão, login, busca global, publicação, mensagens, reserva demonstrativa, fechamento de modal com Escape, expiração de impulsionamento, layout móvel e recuperação de JSON inválido.
- A execução anterior no SHA `45877421e3fcb352cc70ec971da5e2041d58e050` expôs três defeitos nos próprios testes e na disposição dos cartões: seletores ambíguos, texto repetido no perfil e cartões de impulsionamento estreitos na coluna central. Os seletores foram desambiguados e a grade de impulsionamento passou a usar duas colunas em telas grandes antes de chegar a três em telas muito largas. O CI do SHA posterior `c6606c583533f7f55fb99603ff1c354488a41059` está sendo executado; não tratar os testes E2E como aprovados até a conclusão desse run.

### Componentes compartilhados examinados e correções
- `src/components/base/index.tsx` — modal agora usa semântica de diálogo, foco inicial, contenção de Tab, Escape, restauração do foco e bloqueio/restauração de scroll do body.
- `src/components/ui/dialog.tsx`, `alert-dialog.tsx` e `sheet.tsx` — conteúdo limitado à altura disponível e rolável em viewports baixos.
- `Login.tsx` e `Register.tsx` — labels associados aos controles por IDs.
- `PostComposer.tsx` e `Messages.tsx` — nomes acessíveis para campo de publicação, entrada de mensagem e botão de envio.
- `Boost.tsx` — grade responsiva ajustada à largura real da coluna principal com navegação lateral e painel direito.
- Os primitivos Radix compartilhados já fornecem controles de foco/teclado; não foram reescritos. O restante de `src/components/ui/**` não foi auditado arquivo por arquivo.

### Segurança de dependências: bloqueador independente
- `postcss-selector-parser` foi fixado em `6.1.5` com override restrito à dependência `@tailwindcss/typography`, cujo manifesto publicado fixa `6.0.10`. A versão `6.1.5` é a correção compatível da linha 6.x; `npm ci` e o teste de piso de segurança passaram. O relatório de `npm audit` ainda sinaliza `<7.1.6` porque a faixa do aviso não reconhece esse backport. Não ocultar nem remover esse aviso do gate.
- `react-router` / `react-router-dom` continuam em 6.30.6. Os avisos GHSA-wrjc-x8rr-h8h6 e GHSA-337j-9hxr-rhxg indicam correção a partir de 7.18.0; o `npm audit` sugere 7.18.4, que é major. Nenhuma migração major foi aplicada sem uma entrega de compatibilidade dedicada.
- A cadeia Vite / `launch-editor` mantém uma vulnerabilidade alta, GHSA-fx2h-pf6j-xcff, além de avisos moderados; o fix sugerido pelo audit é Vite 8.3.5, também major. A atualização permanece pendente de migração e validação próprias.
- Relatório integral do CI: 9 vulnerabilidades (8 moderadas, 1 alta); `npm audit --omit=dev`: 6 moderadas. O gate continua falhando corretamente.

### Pendências explícitas
- Aguardar e registrar o resultado final de E2E no SHA atual; não declarar fluxo integral validado antes disso.
- Auditar individualmente `src/hooks/**`, `src/App.css`, `src/index.css`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig*.json`, assets, `public/**` e os componentes restantes de `src/components/ui/**`.
- Ainda não foram validados sincronização entre abas, migração de esquemas antigos, quota e falhas persistentes de armazenamento com feedback visual, foco em todos os formulários, navegação responsiva de todas as rotas ou todos os estados de erro.
- Stories, seguir casas, edição completa de perfil, notificações e criação completa de rituais continuam incompletos/indisponíveis. Não há backend provado, autenticação server-side, ledger, webhook, pagamentos ou repasses reais.
- Regras financeiras de 17%/83%, reserva de 2% e retenção de 72h continuam sem implementação financeira real; não confundir simulação local com conformidade de produção.

A revisão integral continua **NÃO CONCLUÍDA**.
