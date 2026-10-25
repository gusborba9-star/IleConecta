# Ilê Conecta

Rede social das casas espirituais e seus clientes: páginas das casas, feed, rituais/eventos, jogos de búzios, mensagens, assistente virtual por casa e impulsionamento.

- **Contas:** `casa` e `cliente`
- **Planos da casa:** base · intermediário (assistente limitada) · máximo (assistente completa)
- **Comissão:** 0% em búzios e trabalhos; **17% em eventos/rituais** (casa recebe 83%; repasse após fim do evento + 72h)
- Documentação de produto: `docs/BLUEPRINT.md`, `docs/ROADMAP.md`, `docs/FINANCIAL_RULES.md`

## Stack
Vite · React 18 · TypeScript · Tailwind · shadcn/ui · React Router · Supabase · Vercel

## Rodar localmente
```bash
npm ci
cp .env.example .env.local   # preencha com a URL e a chave PUBLICA (anon) do Supabase
npm run dev                  # http://localhost:8080
```
Sem as variáveis do Supabase o app roda em **modo demonstração** (dados locais, sem backend).

## Scripts
| Comando | O que faz |
|---|---|
| `npm run build` | build de produção (`dist/`) |
| `npm run lint` | ESLint |
| `npx tsc -b` | checagem de tipos |
| `npm test` | testes de domínio |
| `npm run test:e2e` | testes de navegador (Playwright) |

## Deploy (Vercel)
`vercel.json` já define build, saída (`dist`), instalação (`npm ci`) e reescrita SPA (rotas como `/casa/1` funcionam ao atualizar a página).
Variáveis em *Project Settings → Environment Variables*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Banco (Supabase)
Migrações em `supabase/migrations/`. A `0001_core_schema.sql` cria o schema com RLS ativo. **Nunca** coloque a `service_role` key no frontend nem em variáveis `VITE_*`.

## Estado atual
Protótipo funcional em `localStorage`; pagamentos (Pix/Asaas), ledger e repasses ainda **não** estão integrados (ver `docs/ROADMAP.md`).
