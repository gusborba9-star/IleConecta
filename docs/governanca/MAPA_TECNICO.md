# Mapa técnico do Ilê Conecta (17/11/2026)

Ponto de partida para qualquer pessoa ou conversa nova assumir o sistema. **Autoridade de produto:** `../BLUEPRINT_DEFINITIVO.md` → `ROADMAP.md` → este mapa (que só descreve *onde as coisas estão* e *como operar*; não decide regras). Se este mapa divergir do código, vale o código e o mapa deve ser corrigido.

## 1. Leitura obrigatória, nesta ordem
1. `REGRAS_DE_TRABALHO_DO_EXECUTOR.md` e `PROTOCOLO_EXECUCAO_AUDITORIA.md` (como trabalhar).
2. `../BLUEPRINT_DEFINITIVO.md` e `ROADMAP.md` (o que existe, o que falta, decisões do proprietário).
3. `PLANO_DE_REVERSAO_E_INCIDENTES.md` (se houver problema agora).
4. `OBSERVABILIDADE_FASE6.md` (sinais de erro), `../comercial/REGRAS_FINANCEIRAS.md` (preços/regras) e `../legal/` (Termos, retenção).
Obs.: o `README.md` da raiz é antigo (protótipo); valem os documentos acima.

## 2. Infraestrutura
| Peça | Onde | Identificação |
|---|---|---|
| Código | GitHub `gusborba9-star/IleConecta`, ramo `main` | PR com CI obrigatório, squash-merge |
| Site | Vercel, projeto `ile-conecta` | `prj_t5ujOrQPkmaETTuDbRBgVkSD5MKJ`, time `team_YpETl8VTprdnelFt86Gjmll7`; publica sozinho a cada merge em `main` |
| Banco, login, arquivos, funções | Supabase `filsjhnfrpnqukedlkhf` (us-east-1) | Plano Free até o proprietário contratar o Pro |
| Pagamentos | Stripe (hoje só TESTE) | Chaves como segredos das funções; troca para produção só com autorização expressa |
| IA | OpenRouter | Chave `OPENROUTER_API_KEY` |

**Nunca** tocar nos projetos Supabase de outros produtos do proprietário (Horus, Veritas-OS).

## 3. Código do app (`src/`)
- Vite + React 18 + TypeScript + Tailwind + shadcn/ui. Rotas em `src/App.tsx`; telas em `src/pages/`; componentes por área em `src/components/` (admin, house, feed, chat, assistant, payments…).
- **Padrão "Core":** regra pura e testável em `src/lib/<nome>Core.js` (+ `.d.ts`), e a parte que fala com o banco em `src/lib/<nome>.ts`. Testes de unidade cobrem os Core.
- Estado global em `src/contexts/` (`AppContext`, `PlatformConfigContext`). Sem as variáveis `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` o app roda em modo demonstração local.
- `api/casa.js` (cartão de prévia de link da casa para WhatsApp etc.) e `api/sitemap.js`; reescritas e cabeçalhos de segurança em `vercel.json`.
- Marca: `src/components/brand/Logo.tsx`, `scripts/build-icons.mjs` (gera ícones antes de dev/build), `public/brand/`.

## 4. Banco (Supabase)
- 166 migrations em `supabase/migrations/NNNN_*.sql`, **só para frente** e idempotentes. 129 tabelas em `public`, **todas com RLS**.
- Funções SQL sensíveis são `SECURITY DEFINER` com `set search_path = public`; permissões de dono via `admin_can('dono')`; configurações em `platform_settings` (leitura pública, escrita só por função). Auditoria administrativa em `admin_audit`.
- Áreas de tabelas: contas/casas (`profiles`, `houses`, `house_*`), conversas (`conversations`, `messages`, `conversation_handoff`), agenda/reservas (`reservations`, `house_availability`, `schedule_proposals`), eventos/rituais, posts/feed, **momentos** (`stories`, `moment_reports`, `moment_views`, `moment_likes`, `moment_comments`, `moment_publish_log`, `music_tracks`, `music_settings`; buckets `moments` e `music`, sem acesso direto às tabelas de interação: só por funções), serviços e pedidos, **pagamentos da casa** (`payments`, `payouts`, `ledger_entries`, `refund_*`, `stripe_events`), **cobrança da plataforma** (`platform_*`, `house_billing_*`, `house_card_on_file`), assistente/créditos (`assistants`, `ai_credit_*`, `assistant_*`, `conecta_calls`), suporte (`support_*`), moderação, equipe (`house_staff*`), observabilidade (`system_events`, `health_alerts`, `routine_runs`).
- **Arquivos (Storage):** `avatars`, `covers`, `post-images` (públicos); `chat-files`, `ritual-records`, `report-evidence` (privados).
- **Rotinas (pg_cron), 22 ativas:** cobrança (`platform-billing-tick`, `platform-billing-sweep`, `platform-cancel-apply`, `platform-price-apply`), mensalidades, reservas (`expire-stale-holds`), atendimento (`handoff-remind`), reembolso, promoções, exclusão de contas e `purge-*` de retenção, e `health-check` (a cada 10 min). A lista viva está em Administração > Visão geral > Saúde da plataforma.

## 5. Funções do servidor (`supabase/functions/`, Deno)
| Função | Para quê | Segredos que usa |
|---|---|---|
| `payments` | Pagamento da casa (conta conectada, checkout, webhook, reembolso) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `platform-billing` | Cobrança da plataforma à casa (planos, créditos, impulsionamento, cartão, sweep diário) | `PLATFORM_STRIPE_SECRET_KEY`, `PLATFORM_STRIPE_WEBHOOK_SECRET` |
| `assistant-chat` | Assistente de cada casa (franquia, créditos, limite por pessoa) | `OPENROUTER_API_KEY` |
| `conecta` | Assistente da plataforma (ajuda) | `OPENROUTER_API_KEY`, `CONECTA_MODELS` |
| `support-admin` | Ações administrativas de suporte | chaves do Supabase e do Stripe |
| `push-notify` | Notificações push | chaves VAPID (config no banco) |
| `purge-files` | Remoção de arquivos expirados | service role |
Comuns: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`. **Valores nunca ficam no repositório nem no chat.**
Cada função com manutenção tem uma cópia idêntica de `maintenance.js` (um teste confere).

## 6. Como mudar o sistema (fluxo padrão)
1. Ler Blueprint/ROADMAP; trazer divergências ao proprietário.
2. Branch → código + testes → `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, build; telas: `npm run test:ui` (Playwright com API simulada, `tests/ui/_api.mjs`) e acessibilidade (axe).
3. Banco: escrever a migration, testar num PostgreSQL local com um script `supabase/verify/verify_NNNN.mjs` (usa `pgbase.mjs`; harness em `/tmp/pgup.sh`, pode precisar ser recriado), e **aplicar na produção antes** de integrar o código que depende dela. Aplicação direta por SQL com verificação (simulação de usuário com `set_config('request.jwt.claims')` terminando em `raise exception` para reverter, depois checagem do estado). `supabase/rollout/passo-NNN.sql` guarda o mesmo conteúdo em passos pequenos (`scripts/split-rollout.mjs`); `supabase/rollback/` guarda reversões das migrations antigas mais arriscadas.
4. PR → CI (`npm install, build, lint, TypeScript e auditoria de dependências` + `npm test`, hoje 691 testes) → squash-merge só com CI verde no último commit → conferir o deploy na Vercel.
5. **Funções do servidor não publicam sozinhas.** Depois do merge, disparar o fluxo manual `Deploy de funções` (`.github/workflows/deploy-functions.yml`, só `main`, roda `npm test` antes) **uma função por vez**; conferir `updated_at` com `list_edge_functions`.
6. Atualizar ROADMAP e Blueprint ao fim de cada etapa.

## 7. Testes
- `tests/*.test.mjs` (Node `--test`): regras puras, migrations, cobrança, segurança, manutenção, saúde.
- `tests/ui/*.spec.mjs` (Playwright, servidor de desenvolvimento em `127.0.0.1:4174`): telas com API simulada.
- `supabase/verify/`: banco real local (migrations + RLS + RPCs). `supabase/verify/e2e/`: funções reais no Deno contra PostgreSQL e Stripe simulado. `scripts/carga/`: teste de carga (ver `TESTE_DE_CARGA_FASE6.md`).
- O CI roda `npm test`, build, lint, tsc e auditoria; **não** roda a suíte de UI nem os `verify` (rodar localmente antes de abrir o PR).

## 8. Diagnóstico de um erro
1. **Saúde da plataforma** (Administração > Visão geral): erros do app, falhas de IA e de funções (últimas 1 h/24 h, agrupados por rota e detalhe), rotinas, banco, alertas e manutenção ligada. Dados em `system_events` (30 dias).
2. **Logs:** Supabase (`query_logs`: API, auth, funções, banco) e Vercel (erros em tempo de execução, logs de build).
3. **Histórico:** últimos deploys da Vercel, `list_migrations`/`list_edge_functions` (data de atualização), commits recentes.
4. **Reproduzir** local (teste UI ou `verify`), corrigir, escrever teste de regressão.
5. **Dinheiro:** `payments`, `stripe_events`, `webhook_events`, `platform_charges`, `platform_billing_events`, `refund_log`; conferir também o painel do Stripe.
6. Se grave: seguir `PLANO_DE_REVERSAO_E_INCIDENTES.md`.

## 9. Interruptor de emergência
`platform_settings.maintenance = {assistant, payments, message, since}`. Só `true` exato bloqueia (falha de leitura não bloqueia nada). `payments` bloqueia só *novos* pagamentos/assinaturas/créditos/impulsionamentos e a cobrança automática de cartão; webhooks, reembolsos e conferências continuam. O usuário vê faixa de manutenção; Saúde mostra e alerta após 1 h ligada. Controle em Administração > Visão geral (somente dono).

## 10. Armadilhas conhecidas
- O harness local concede permissões em bloco e pode esconder erro de ACL; confirmar permissões na produção.
- `account_type` só aceita `casa` e `cliente`.
- Um deploy de função em paralelo cancela o anterior (grupo de concorrência); disparar um por vez.
- `gh pr merge` está bloqueado neste ambiente; o merge é feito pela integração do GitHub com o SHA completo.
- Pagamentos Stripe são TESTE; limpeza de dados de teste (`supabase/launch/limpeza_dados_de_teste.sql`) e virada para produção só no dia do lançamento, com autorização.
- Plano Free do Supabase: sem backup baixável e realtime/limites mais baixos; revalidar após o Pro.

## 11. Pendências abertas (resumo; a lista viva está no ROADMAP)
Limpeza de fotos órfãs no storage; peso real das imagens do feed no celular; Supabase Pro; domínio `ileconecta.com.br`; MFA da conta do dono; monitor externo e avisos por e-mail (Stripe/Supabase/Vercel); limite mensal de gasto na OpenRouter; frase da marca; titularidade do atendimento em conversa casa↔casa; nota jurídica futura (transferência internacional de dados e log técnico de 30 dias); no dia do lançamento: limpeza de dados de teste, Stripe em produção, e-mails finais e testes ponta a ponta.
