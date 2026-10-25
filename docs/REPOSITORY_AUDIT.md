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
