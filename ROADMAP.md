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

### Pendências antes da conclusão da EXEC-01

1. Executar em ambiente com acesso ao repositório e ao registry npm: `npm ci`.
2. Executar `npm run build`, `npm run lint` e `npx tsc -b`; registrar logs e corrigir falhas dentro do escopo.
3. Revisar o resultado de build e verificar se existem problemas adicionais de imports, TypeScript ou assets.
4. Validar implantação Vercel somente quando possível, sem modificar produção; caso dependa de integração externa, transferir essa validação para EXEC-02.
5. Solicitar validação do CTO antes de merge. Nenhuma alteração foi feita diretamente em `main`; nenhuma alteração de produção foi autorizada ou executada.

**Critério de encerramento:** EXEC-01 permanece em andamento até haver evidência verificável de build bem-sucedido e registro real dos testes pertinentes.
