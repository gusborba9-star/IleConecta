# Roadmap — Ilê Conecta

> Este arquivo foi criado na branch da execução EXEC-01 porque não foi localizado um Blueprint ou Roadmap existente na raiz ou em `docs/` nos caminhos consultados. Não representa a validação do CTO nem substitui documentos de arquitetura que possam existir em outros locais.

## EXEC-01 — Correção do build e preparação técnica para Vercel

**Estado:** EM ANDAMENTO — correção de configuração registrada; validação de build pendente.  
**Branch:** `exec-01/fix-vite-build-vercel`  
**Commit de correção:** [01e16b4489b1ffc1b6eef7961498e4c73d849cf5](https://github.com/gusborba9-star/IleConecta/commit/01e16b4489b1ffc1b6eef7961498e4c73d849cf5)

### Diagnóstico baseado no código consultado

- `package.json` declara `@vitejs/plugin-react-swc` como dependência de desenvolvimento.
- `vite.config.ts` importava `@vitejs/plugin-react`, pacote não declarado no `package.json`.
- `package-lock.json` declara `@vitejs/plugin-react-swc` na árvore de dependências.
- A correção aplicada foi alinhar o import do Vite ao plugin React/SWC já declarado, sem adicionar dependência redundante.
- Não foi localizado `vercel.json` nos caminhos consultados. A configuração padrão de Vite pode ser suficiente para implantação estática, mas isso ainda não foi validado na Vercel.
- Não foram localizados Blueprint/Roadmap nos caminhos consultados na raiz ou em `docs/`; a busca não prova que não exista documentação em outro caminho.

### Alterações

- `vite.config.ts`: troca do import de `@vitejs/plugin-react` para `@vitejs/plugin-react-swc`. Mantidos alias, plugin invocation e configuração do servidor.
- `ROADMAP.md`: criado registro mínimo desta execução, pois o arquivo não existia no caminho consultado.

### Evidências e verificações

- [Configuração Vite antes da correção](https://github.com/gusborba9-star/IleConecta/blob/main/vite.config.ts)
- [Dependências declaradas](https://github.com/gusborba9-star/IleConecta/blob/main/package.json)
- [Lockfile](https://github.com/gusborba9-star/IleConecta/blob/main/package-lock.json)
- [Commit da correção](https://github.com/gusborba9-star/IleConecta/commit/01e16b4489b1ffc1b6eef7961498e4c73d849cf5)

**Testes locais:** NÃO EXECUTADOS. A tentativa de clonar o repositório para executar os comandos falhou porque o ambiente não conseguiu resolver `github.com` (`Could not resolve host: github.com`). Portanto, não há evidência de `npm ci`, `npm run build`, `npm run lint` ou verificação TypeScript nesta execução. Não interpretar a correção estática como build aprovado.

### Achado adicional — lockfile inconsistente

A comparação das dependências de topo mostra que `package.json` declara pacotes que não aparecem no bloco `packages[""].dependencies` de `package-lock.json`, incluindo `@google/generative-ai`, `@react-three/drei`, `@react-three/fiber`, `axios`, `chart.js`, `crypto-js`, `framer-motion`, `hls.js`, `leaflet`, `react-calendar`, `react-dropzone`, `react-helmet-async`, `react-leaflet`, `react-redux`, `three`, `uuid`, `web-vitals`, `xlsx` e `zustand`. Portanto, além do plugin Vite, existe evidência de que o lockfile está desatualizado em relação ao manifesto. Não foi regenerado porque o ambiente não conseguiu clonar o repositório nem executar npm; a atualização deve ser feita com npm em ambiente funcional e revisada para evitar alterações indiscriminadas.

### Pendências antes da conclusão da EXEC-01

1. Executar em ambiente com acesso ao repositório e ao registry npm: `npm ci`.
2. Executar `npm run build`, `npm run lint` e `npx tsc -b`; registrar logs e corrigir falhas dentro do escopo.
3. Revisar o resultado de build e verificar se existem problemas adicionais de imports, TypeScript ou assets.
4. Validar implantação Vercel somente quando possível, sem modificar produção; caso dependa de integração externa, transferir essa validação para EXEC-02.
5. Solicitar validação do CTO antes de merge. Nenhuma alteração foi feita diretamente em `main`; nenhuma alteração de produção foi autorizada ou executada.

**Critério de encerramento:** EXEC-01 permanece em andamento até haver evidência verificável de build bem-sucedido e registro real dos testes pertinentes.


## Atualização de evidências — 2026-10-24 02:36 UTC

### Estado da branch e comparação
- Branch de execução: `exec-01/fix-vite-build-vercel`.
- HEAD observado antes desta atualização: `fc69a5938c48f92cd79176d2b57de0930ffde5cd`.
- Comparação GitHub `main...exec-01/fix-vite-build-vercel`: 3 commits à frente, 0 atrás; alterações na branch: `vite.config.ts` e este `ROADMAP.md`.
- PR: https://github.com/gusborba9-star/IleConecta/pull/1 — continua independente da DOC-02.

### Verificação estática de manifesto e lockfile
- `package.json` declara `@vitejs/plugin-react-swc`; `vite.config.ts` na branch importa esse mesmo pacote.
- `main` ainda importa `@vitejs/plugin-react`, que não está declarado no manifesto nem presente em `package-lock.json`; o lockfile contém `@vitejs/plugin-react-swc`.
- A comparação automatizada dos objetos de dependências de topo do manifesto e do lockfile encontrou 27 dependências declaradas em `package.json` ausentes de `packages[""].dependencies` no lockfile:
  `@google/generative-ai`, `@react-three/drei`, `@react-three/fiber`, `@react-three/rapier`, `@reduxjs/toolkit`, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `@supabase/supabase-js`, `@tanstack/react-query-devtools`, `axios`, `chart.js`, `crypto-js`, `framer-motion`, `hls.js`, `jspdf`, `leaflet`, `qrcode`, `react-calendar`, `react-dropzone`, `react-helmet-async`, `react-leaflet`, `react-redux`, `three`, `uuid`, `web-vitals`, `xlsx`, `zustand`.
- Nenhuma divergência de faixa de versão foi encontrada entre as dependências que aparecem em ambos os blocos. Não foi alterado/regenerado o lockfile.
- `package.json` possui scripts `build` (`vite build`) e `lint` (`eslint .`), mas não declara script de testes. Busca de arquivos/termos de teste não retornou resultados; isso não prova ausência absoluta de testes.

### Testes locais e limitação de infraestrutura
- Nova tentativa de acesso ao GitHub em 2026-10-24 02:35:32 UTC: `git clone --depth 1 --branch exec-01/fix-vite-build-vercel https://github.com/gusborba9-star/IleConecta.git /tmp/IleConecta-exec01` — falhou com `Could not resolve host: github.com`.
- Repetição controlada em 2026-10-24 02:36:17 UTC: `git ls-remote https://github.com/gusborba9-star/IleConecta.git refs/heads/exec-01/fix-vite-build-vercel` — falhou com a mesma mensagem DNS.
- Como o código completo não pôde ser obtido no ambiente de execução, `npm ci`, `npm run build`, `npm run lint`, `npx tsc -b` e testes locais não foram executados. Isso é bloqueio de infraestrutura/acesso, não resultado de falha desses comandos.

### Evidência remota de Preview Vercel — não equivale a testes locais nem a produção
Para o commit `fc69a5938c48f92cd79176d2b57de0930ffde5cd` da branch EXEC-01, a listagem de deployments e os status do GitHub registraram Preview `READY` nos três projetos:
- `ile-conecta`: https://vercel.com/gustavo-borba-s-projects/ile-conecta/3CLZte3Dzyq6TxizW6EuCUnbkzqb
- `ile-conecta-tdfx`: https://vercel.com/gustavo-borba-s-projects/ile-conecta-tdfx/4Jy8ZGsNCconcTZL2TZzNMqHsCqb
- `ile-conecta-9qfn`: https://vercel.com/gustavo-borba-s-projects/ile-conecta-9qfn/4L8Tn66aFVdb5feCSSGozF4adqzG
Esses estados indicam deployments Preview prontos para esse commit, mas não fornecem, por si só, logs completos nem comprovam `npm ci`, lint, TypeScript ou testes locais.

### Auditoria somente de leitura dos projetos Vercel
Equipe observada: `Gustavo Borba's projects` (`team_YpETl8VTprdnelFt86Gjmll7`). Os três projetos reportam framework `vite`, Node.js `24.x`, `live=false`, sem variáveis de ambiente listadas pela consulta de metadados e sem domínio customizado observado. Cada um tem domínio padrão Vercel próprio; não foi possível confirmar qual domínio é pretendido como oficial.
- `ile-conecta` / `prj_rVBhGsvT8AhUw26PuBib6k2I1MM9`: deployment de produção observado em `ERROR`, commit `93e7060756b29d397b75f2151d870606a33b9692`, branch `main`. Domínio padrão observado: `ile-conecta.vercel.app`.
- `ile-conecta-tdfx` / `prj_FmsjVT47L4tN4lTmUnfozePihQ5D`: deployment de produção observado em `CANCELED`, mesmo commit e branch. Domínio padrão observado: `ile-conecta-tdfx.vercel.app`.
- `ile-conecta-9qfn` / `prj_oAQrw9HJ8QDo7CNUVlsDJPiW4buv`: deployment de produção observado em `ERROR`, mesmo commit e branch. Domínio padrão observado: `ile-conecta-9qfn.vercel.app`.
- Os três deployments de produção listados apontam para o mesmo commit inicial e a mesma branch `main`. A listagem de domínios não mostrou domínio customizado exclusivo. A consulta de variáveis não retornou nomes de variáveis. Root Directory, Production Branch configurada, Install/Build Command, Output Directory e integrações não puderam ser confirmados pelos campos retornados pelas consultas disponíveis.
- A consulta de logs/detalhes de deployment pela API Vercel retornou `404 not_found / Deployment not found` para os IDs consultados, apesar de os deployments aparecerem nas listagens. Portanto, a causa raiz dos estados de produção `ERROR`/ `CANCELED` permanece não comprovada.
- Classificação provisória: `ile-conecta` é o candidato preferencial apenas por ter o alias padrão canônico `ile-conecta.vercel.app`; ainda não está confirmado como projeto oficial. `ile-conecta-tdfx` e `ile-conecta-9qfn` são duplicatas prováveis, não autorizadas para exclusão. A confirmação do domínio pretendido e das configurações/integrations exclusivas continua pendente.

### Falhas automáticas de PRs — separadas da execução
- PR #1 / EXEC-01: os três status Vercel para o commit `fc69a5938c48f92cd79176d2b57de0930ffde5cd` estavam `success`; os deployments Preview correspondentes aparecem como `READY`. Isso não substitui os testes locais pendentes.
- PR #2 / DOC-02: no HEAD `cf0fd36a7fd709c75e06c28835ca4412cef85af7`, os status consultados estavam `failure` para `ile-conecta` e `ile-conecta-tdfx`, e `pending` para `ile-conecta-9qfn`. Os deployments listados correspondem à branch `doc-02/official-documentation-baseline`, não à EXEC-02; nenhuma ação manual foi executada. Os logs específicos não ficaram acessíveis pela consulta da API, portanto as causas não foram diagnosticadas.

### Estado de governança e critérios pendentes
- EXEC-01 permanece **ABERTA**. O ajuste estático do Vite e os Previews remotos `READY` são evidências positivas, mas os comandos locais exigidos continuam não executados e a causa raiz dos deployments de produção não foi comprovada.
- DOC-02 permanece em revisão, sem aprovação ou merge. EXEC-02 não foi iniciada nem autorizada.
- Nenhuma alteração em `main`, configuração Vercel, domínio, variável de ambiente, Supabase, Asaas, banco, dados ou produção foi feita.
- Próximos passos: obter um ambiente com acesso ao GitHub e ao registry npm; executar os quatro comandos e testes relevantes; obter logs Vercel acessíveis e comparar configurações completas dos três projetos; confirmar com o CTO o domínio/projeto oficial antes de qualquer exclusão.


## Complemento de validação — 2026-10-24 02:57 UTC

### Tentativa de executar testes no ambiente disponível
- Ambiente local: Node.js `v22.16.0`, npm `10.9.2`, Git `2.47.3`.
- O diretório de trabalho não contém checkout do repositório. Tentativa executada: `git clone --depth 1 --branch exec-01/fix-vite-build-vercel https://github.com/gusborba9-star/IleConecta.git /tmp/IleConecta-exec01`.
- Resultado real: código de saída 128; `fatal: unable to access 'https://github.com/gusborba9-star/IleConecta.git/': Could not resolve host: github.com`.
- Verificação de DNS: `getent hosts github.com` não retornou endereço. Portanto, não havia arquivos de projeto locais nos quais executar `npm ci`, `npm run build`, `npm run lint` ou `npx tsc -b`. Esses comandos permanecem **não executados**, não aprovados nem reprovados.
- Não foi criado sandbox remoto nem alterada configuração de rede para evitar introduzir um recurso ou mudança remota não autorizada.

### Status GitHub–Vercel consultados novamente
- HEAD EXEC-01 `1687ef725a004aba2cfffd69d1d7c1c8ce66afab`: os três status Vercel foram consultados novamente e retornaram `success`:
  - [ile-conecta](https://vercel.com/gustavo-borba-s-projects/ile-conecta/2GQfg8bQ76FC7svVUAim7dnjo5ZF)
  - [ile-conecta-tdfx](https://vercel.com/gustavo-borba-s-projects/ile-conecta-tdfx/3M8yHHYTDhnUn8HDamzQykUwUt2U)
  - [ile-conecta-9qfn](https://vercel.com/gustavo-borba-s-projects/ile-conecta-9qfn/J4ddxxvDxMBdZFRVcXRkFoJpHBRF)
- HEAD DOC-02 `cf0fd36a7fd709c75e06c28835ca4412cef85af7`: os três status Vercel foram consultados novamente e retornaram `failure`:
  - [ile-conecta](https://vercel.com/gustavo-borba-s-projects/ile-conecta/B3QWkS71JCNaf2hBjMdeXu2tzEAp)
  - [ile-conecta-tdfx](https://vercel.com/gustavo-borba-s-projects/ile-conecta-tdfx/F1DZFg9XU6D8fEJK8efxfgW1dEbM)
  - [ile-conecta-9qfn](https://vercel.com/gustavo-borba-s-projects/ile-conecta-9qfn/4kLkJnnLGeqLRv1q3MFJRJW4fhiD)
- Para os seis identificadores de deployment, a consulta de logs de build retornou `404 not_found / Deployment not found`; não foi possível obter as etapas que causaram os status. Não inferir a causa a partir do status isolado.

### Auditoria Vercel — limite de acesso encontrado nesta rodada
- `get_project` para os três nomes retornou `404 not_found / Project not found`.
- Consultas de deployments e logs de runtime para os três IDs retornaram `403 forbidden` (sem permissão ou projeto não acessível pelo contexto de API atual).
- Consultas de runtime errors retornaram `403 forbidden`. A mensagem de logs especifica que a consulta falhou antes de retornar resultados; isso **não** significa que não existam logs.
- A listagem de projetos filtrada por `repo=gusborba9-star/IleConecta` retornou zero projetos para o contexto atual, embora o histórico desta auditoria contenha resultados anteriores. Não interpretar essa diferença como exclusão dos projetos; registrar como mudança/limitação de acesso à API até verificação por um proprietário autorizado.
- Como consequência, root directory, comandos de instalação/build, output directory, variáveis por nome, integrações, domínios atuais e logs runtime ficam **não verificados nesta rodada**. Os dados históricos do Roadmap continuam identificados como observações anteriores, não como confirmação atual.
- Nenhuma configuração, variável, domínio, integração, deployment ou projeto foi alterado.

### Estado atualizado
- EXEC-01 continua **ABERTA**: a verificação automática Vercel do HEAD `1687ef725a004aba2cfffd69d1d7c1c8ce66afab` retornou `success` nos três projetos, mas não substitui os quatro comandos locais obrigatórios nem fornece logs de produção acessíveis.
- DOC-02 permanece em revisão. EXEC-02 não iniciada nem autorizada. PR #1 e PR #2 não foram mescladas.
- Próxima ação necessária: recuperar acesso autorizado ao repositório/registry no ambiente de teste e ao contexto de leitura dos projetos Vercel; executar os comandos e recuperar logs completos antes de determinar causa raiz ou escolher definitivamente o projeto oficial.
