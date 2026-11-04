# E2E local da EXEC-01 (Deno + PostgreSQL)

Executa o `supabase/functions/payments/index.ts` **real** no Deno, com o `supabase-js` real, contra um PostgreSQL 16 real com as migrations 0001–0066.

## O que é real e o que é substituto

| Componente | Situação |
|---|---|
| Edge Function (`index.ts`, `core.js`, `store.js`, `provider.js`, `stripeAdapter.js`) | **real**, executada no Deno 2.9.6 (`denoEntry.ts` só redireciona `api.stripe.com` para a API simulada e fixa a porta) |
| `@supabase/supabase-js` | **real** (`npm:@supabase/supabase-js@2.45.4`, o mesmo do `index.ts`) |
| PostgreSQL + migrations 0001–0066 | **real** (PG 16 local; stubs de `auth`, `storage`, `cron`, `vault`, `net`) |
| PostgREST / GoTrue | **substituído** por `restShim.mjs` (traduz o subconjunto usado: select/update/rpc/embed muitos-para-um e `/auth/v1/user`) |
| API do Stripe | **simulada** por `fakeStripe.mjs` — NÃO é o Stripe real |
| `check_cron_secret` | **real** (migration 0065, lê `vault.decrypted_secrets`); só o Vault é simulado, com o segredo do teste |

## Como rodar

```
# PostgreSQL 16 em 127.0.0.1:5544 (user postgres, trust) e:
npm i --no-save pg deno          # deno via npm (binário oficial)
DENO_BIN=node_modules/.bin/deno node supabase/verify/e2e/run_e2e.mjs
```

Saída esperada: `105 PASS / 0 FAIL` (uma linha PASS/FAIL por verificação; a execução de referência está na descrição da PR #140). Cada execução recria o banco `e2e`.

## Sensibilidade (testes de mutação)

Alterando a migration temporariamente, o E2E precisa falhar: (1) `finish_stripe_event` sem conferir o token → 2 falhas; (2) `payment_identity_matches` sem identidade estrita → 1 falha; (3) `payment_recorded_amounts` ignorando o ledger → 2 falhas.

## Reprodução de eventos reais (`replay_real_events.mjs`)

Reproduz, localmente, payloads reais de `stripe_events` contra o código da EXEC-01. O arquivo de payloads **não é versionado** (contém dados de teste pessoais): informe `REAL_EVENTS=/caminho/real_events.json`.
A assinatura é refeita com o segredo local (a original só vale para o endpoint de produção); a consulta ao Stripe continua simulada. Uso:
`REAL_EVENTS=... DENO_BIN=<deno> node supabase/verify/e2e/replay_real_events.mjs`
