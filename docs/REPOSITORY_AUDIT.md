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
| Comissão e repasse | Modal/contexto usam `ritual.platformFeePct` e aritmética JS com `toFixed(2)` | Demonstração incompatível com a nova regra aprovada | A execução financeira futura deve usar 17%/83%, centavos inteiros e backend; esta ordem não autoriza alterar o fluxo de pagamento. |
| Boost/destaque | Atualizações locais no contexto | Simulado/local | Sem cobrança, autorização server-side ou expiração confiável. |
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

### 8.3 Resultados de execução — distinção obrigatória

| Verificação | Resultado real nesta sessão |
|---|---|
| Comparação estática package.json/package-lock.json | Executada por leitura dos arquivos; 27 dependências raiz declaradas ausentes do bloco raiz do lockfile |
| `npm ci` | **NÃO EXECUTADO** |
| `npm run build` | **NÃO EXECUTADO** |
| `npm run lint` | **NÃO EXECUTADO** |
| `npx tsc -b` | **NÃO EXECUTADO** |
| `npm audit` | **NÃO EXECUTADO** |
| Navegação/refresh e inspeção de console em navegador | **NÃO EXECUTADO** |
| Testes de autenticação/autorização, persistência multiusuário ou pagamentos | **NÃO EXECUTADO** |

O estado de sucesso de uma verificação remota Vercel anterior, quando associado a outro SHA ou sem logs acessíveis, não substitui os comandos acima nem comprova lint, TypeScript, segurança ou comportamento funcional.

### 8.4 Plano de estabilização sem ampliação de escopo

1. Manter a correção do import Vite nesta branch isolada, sem merge.
2. Em ambiente de execução funcional, registrar Node/npm, SHA exato e saída completa de `npm ci`, build, lint, TypeScript e auditoria de dependências.
3. Corrigir o lockfile apenas após reproduzir a inconsistência e revisar o diff; escolher um gerenciador principal. Não apagar `bun.lock` sem revisão específica.
4. Criar testes para cálculos monetários em centavos e máquina de estados apenas na execução financeira autorizada; não conectar provedor nesta etapa.
5. Registrar evidência de navegação/refresh, responsividade, acessibilidade e console quando houver navegador de teste.
6. Não declarar o produto operacional enquanto autenticação, autorização e persistência forem locais/simuladas.
