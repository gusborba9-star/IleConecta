# Auditoria §31.3 — Reconciliações técnicas (somente leitura)

- Data: 2026-11-09. Tipo de ordem: **Auditoria** (nenhum código, dado, migration ou configuração de produção foi alterado).
- Base: branch `exec-01/payment-provider-decoupling` @ `950c55f` (inclui migrations 0064–0066 ainda **não aplicadas** em produção) e produção Supabase `filsjhnfrpnqukedlkhf`, consultada **somente com SELECT** (catálogo, contagens, advisors).
- Estados conforme Blueprint §31.2. "Não verificado" nunca significa "não existe".
- Reprodução: `supabase/verify/audit/` (ver README da pasta).

## 1. Fatos de produção usados (2026-11-09)

- 61 de 61 tabelas com RLS ligado; 15 sem política (somente acesso de serviço, intencional).
- 3 casas, 4 perfis, 14 pedidos de serviço (4 confirmados, 2 estornados, 8 falhos), 2 reservas, 2 conversas, 0 equipe, 27 aceites.
- 14 pagamentos, todos `stripe`, regra `v2-2026-10`, comissão 4%. Nenhuma linha com 17% ou 5%. `asaas_events`, `webhook_events`, `payouts`, `house_debits`: 0 linhas.
- Registro de migrations do Supabase: **18** entradas (repo: 66).
- Comparação de impressões digitais (tabelas/colunas, políticas, gatilhos, funções) entre produção e o banco reconstruído das migrations 0001–0063: tabelas, políticas e gatilhos **idênticos**; funções idênticas exceto: `check_cron_secret` (existe só em produção; a 0065 a reproduz) e `is_house_owner`/`is_conversation_member` (repo usa `(select auth.uid())`, produção usa `auth.uid()` direto: mesma regra, avaliação menos eficiente em RLS).

## 2. Matriz

| # | Reconciliação | Estado | O que existe | O que falta / risco | Prioridade |
|---|---|---|---|---|---|
| 1 | 17% × 15%/4% | **testado** | `fee_cents` = 15% ritual / 4% serviço e mensalidade; textos jurídicos e UI coerentes; dados de produção só com 4% e regra v2; estorno usa a comissão registrada (0064). | Migrations 0001/0011/0013 ainda citam 17%/5% em comentários e funções antigas (superadas pela 0019); sem efeito em dados. | P3 |
| 2 | Provedores antigos | **evidência parcial** | Nenhum código de Edge Function/UI chama Asaas ou Mercado Pago. | Resíduos dormentes no banco: `asaas_events`, `webhook_events`, colunas `asaas_*`, `escrow_*`, `split_done_at`, `payouts`, `house_debits`, `release_due_payouts` (todas com 0 linhas). Remover é migration destrutiva: depende de autorização. | P3 |
| 3 | Integração × retenção | **evidência parcial** | Stripe Connect cobrança direta: a plataforma não retém valor; textos dizem "sem retenção". | Caminho legado de repasse 72h permanece no banco (só para provedor não Stripe, 0 linhas). Decidir manter ou remover (item 2). | P3 |
| 4 | RLS e exposição pública | **evidência parcial** (118 PASS / 3 FAIL em 121 verificações locais) | RLS em todas as tabelas; isolamento entre casas, anon e cliente comprovado nas tabelas e em 14 funções (de 42) executáveis pelo anon; buckets sensíveis privados. | Ver F2, F9, F10, F11. | **P1** (F2) |
| 5 | Convite e permissões da equipe | **evidência parcial** (20 verificações OK; **falha de concorrência**) | Convite, limite por plano, aceite, permissões por chave, pausa, remoção, resposta identificada ("atendido por"), privilégio mínimo. | Ver F1 (P1) e F6. | **P1** (F1) |
| 6 | Continuidade do handoff | **parcial** | Marcador `[[CASA]]` → notificação à casa (1 por 30 min) → casa/equipe responde na mesma conversa. | Ver F4. | P2 |
| 7 | Persistência e recuperação | **parcial** | Validação do estado local, cópia de recuperação de chave corrompida, banco como fonte nas rotas reais. | Ver F5. | P2 |
| 8 | CRM unificado × disperso | **lacuna** (Roadmap Fase 5) | Peças dispersas: `follows`, `house_members`/`member_dues`, conversas, pedidos, reservas, notificações, relatórios da assistente. | Não há timeline por pessoa nem central de pendências; "pendência" do handoff é só uma notificação. Construir exige desenho aprovado. | P2 |
| 9 | Agenda, reserva e checkout | **evidência parcial** | Última vaga (4 simultâneos → 1), retenção paga de 15 min, expiração libera vaga e falha o pagamento pendente, exclusão por horário em serviços (4 simultâneos → 1), fonte única de horários, confirmação tardia tratada (0064). | Ver F3 e F7. A função de pagamentos em produção ainda é a versão 18 (EXEC-01 não aplicada). | **P1** (F3) |
| 10 | Migrations × Supabase | **testado** (comparação reproduzível) | Schema de produção = repo até 0063 (tabelas, políticas, gatilhos idênticos). | Registro com 18 de 66 entradas: migrations aplicadas sem registro; 0064–0066 não aplicadas; 2 funções com forma menos eficiente (§1). Ver F12. | P2 |

## 3. Achados (ordenados por prioridade)

**F1 — P1 · Convite da equipe pode ser usado por várias pessoas ao mesmo tempo (reproduzido).**
`accept_staff_invite` lê o convite sem travar a linha e só depois marca `used_at`. Com 5 aceites simultâneos do mesmo convite, 29 a 30 de 30 rodadas criaram mais de um vínculo; isso também fura o limite de acessos do plano. Em produção ainda não há equipe (0 vínculos). Correção mínima: `for update` no convite e trava da casa antes de contar acessos. Exige migration (autorização).

**F2 — P1 · Perfis e curtidas legíveis sem login.**
`profiles_read` e `post_likes_read` têm `USING (true)` para `public`: qualquer visitante lê nome, avatar, bio, cidade, estado, último acesso e tipo de conta de **todos** os perfis (inclusive clientes) e quem curtiu cada publicação. Em uma plataforma de casas religiosas, ligar a identidade de uma pessoa à plataforma pode ser dado pessoal sensível (Blueprint §26). Produção tem política idêntica. Correção exige decisão do proprietário (o que é público: só casas? cliente só para quem interage?) e alteração de RLS (autorização expressa, protocolo §6).

**F3 — P1 · Reservas de ritual não encerram 1 hora antes do início (Blueprint §10.2).**
`reserve_event` só bloqueia quando `starts_at <= now()`; uma reserva a 20 minutos do início foi aceita. Correção: `starts_at <= now() + interval '1 hour'` em `reserve_event`, e a assistente deixar de oferecer o ritual nessa janela. Exige migration (autorização).

**F4 — P2 · Handoff sem estado de responsável.**
Não há registro persistente de "quem está com a conversa". O cliente chama a assistente sempre que a casa está offline (mesmo depois de a casa ou a equipe ter respondido), então a automação pode falar por cima do atendente humano (Blueprint §13: "automação não disputa conversa com atendente humano"). O aviso de handoff e o relatório contam notificações por busca no texto (`like '%precisa de você%'`), frágil se o texto mudar. Sem assumir, transferir, encerrar e retomar automação, e sem pendência de CRM.

**F5 — P2 · Dados de demonstração misturados aos reais.**
Com Supabase configurado, `AppContext` ainda carrega casas, publicações, rituais e conversas de demonstração (`casa_1`…, contas com senha `123456`) do código e do `localStorage` e os mescla às listas (Descobrir, Feed, Rituais). Confirmado em código; efeito no site publicado **não verificado** (o navegador do ambiente não alcança a rede externa). Blueprint §25.2: o banco é a fonte de verdade.

**F6 — P2 · Equipe sem trilha de auditoria.**
Convite, aceite, pausa, remoção e alteração de permissões não geram registro em `admin_audit` (0 registros após o ciclo completo); Blueprint §15 e §26 pedem auditoria.
**Correção (0069, decisão do proprietário em 2026-11-10):** tabela `staff_audit` alimentada por gatilhos (convite criado/cancelado, aceite, pausa, reativação, remoção, mudança de permissões e de nome); só o dono da casa lê o histórico da própria casa; a administração consulta por `admin_staff_audit(casa, motivo)`, com motivo obrigatório, consulta registrada e invisível para a casa; ninguém edita nem apaga; retenção de 12 meses (cron `purge-staff-audit`). Não guarda conteúdo de conversa nem token de convite. **Aplicada em produção em 2026-11-10 e validada com consulta real do dono e da administração.**

**F7 — P2 · Ritual não ocupa a agenda de atendimentos.**
Um ritual publicado no mesmo horário de um atendimento com agenda deixa o horário livre para agendamento. Decisão do proprietário: o ritual consome a agenda da casa? (Blueprint §9 pede fonte única de disponibilidade.)

**F8 — P3 · Cliente altera o próprio `account_type` para `casa` pela API** (`profiles_update`), passando a poder criar casa sem o fluxo de cadastro. Efeito limitado; avaliar travar a coluna.
**Correção (0070 a):** gatilho `profiles_guard_account_type` recusa a troca quando a sessão é `anon`/`authenticated`; cadastro, service_role e SQL Editor seguem iguais. Testado com ataque real (cliente→casa e casa→cliente recusados, edição de nome/cidade/bio e cadastro de casa preservados).

**F9 — P3 · `anon` e `authenticated` com TRUNCATE/REFERENCES/TRIGGER em todas as tabelas** (padrão do Supabase). RLS não cobre TRUNCATE; a API REST não o expõe. Reforço: revogar esses privilégios (migration).
**Correção (0070 b):** revoga TRUNCATE, REFERENCES, TRIGGER (e MAINTAIN, que existe no PostgreSQL 17 de produção) de `anon` e `authenticated` nas tabelas existentes e nas futuras (privilégios padrão do dono `postgres`). Verificado: 0 de 62 tabelas expostas; SELECT/INSERT/UPDATE/DELETE e `service_role` intactos; TRUNCATE e criação de gatilho recusados para os dois papéis.

**F10 — P2 · Proteção contra senhas vazadas desativada** (Auth do Supabase). Ação do proprietário no painel (Authentication → Sign In / Providers → Password security).

**F11 — P3 · Três funções sem `search_path` fixo** (`fee_cents`, `stage_amount_cents`, `events_guard_seats`; aviso do linter). Correção trivial em migration.

**F12 — P2 · Registro de migrations incompleto** (18 de 66) e duas funções de RLS com forma menos eficiente. Reparar o registro e aplicar 0064–0066 exige autorização; as duas funções entram numa migration nova.

## 3.1 Correções preparadas (branch `fix/exec-02-f1-f2-f3-f7`, migration 0067, NÃO aplicada em produção)

Decisões do proprietário (2026-11-09): F2 só casas são públicas (cliente só aparece a quem tem relação; contagem de curtidas pública, quem curtiu só a dona da casa); F7 o ritual ocupa a agenda de atendimentos, com duração obrigatória; F10 ação dele no painel.

| Achado | Correção | Evidência |
|---|---|---|
| F1 | `for update` no convite e na casa; limite de acessos serializado | corrida 0/30 (A e B); sem a trava da casa o cenário B falha 27/30 |
| F2 | `profiles_read`, `likes_read`, `peer_info` restritos; `can_view_profile`; RPC `post_like_counts`; app mostra "Participante" quando não há acesso ao perfil | probe 163/0 incluindo cada relação (pedido, reserva, fila, seguidor, membro, comentário, reembolso) |
| F3 | reservas, fila e aviso de vaga encerram 1 h antes; assistente não oferece o ritual na janela; cartão do ritual usa a mesma regra | probe (59 min recusa, 61 min aceita) + teste unitário |
| F7 | `events.duration_min`; gatilho recusa publicar sobre atendimento; `available_slots` e `create_booking` consideram o ritual; formulário exige duração | probe (bloqueio, conflito, corrida ritual×reserva 12 rodadas) |
| F11, F12 | `search_path` fixo e `(select auth.uid())` nas funções citadas | migration aplica duas vezes sem erro |

Continuam abertos: F4, F5, F8, F9, F10 (painel Supabase), reparo do registro de migrations (F12), 0064–0067 em produção (exigem autorização).

## 4. Fora do escopo desta auditoria (confirmado)

Nenhum merge, deploy, migration, alteração de RLS/credencial, dado ou configuração de produção foi feito. As sondagens rodaram em PostgreSQL 16 local com as migrations do repositório; produção só recebeu SELECT.

## 5. Limitações

- As sondagens usam um banco local com os privilégios de produção medidos; não exercitam o PostgREST/GoTrue reais.
- A corrida de F1 foi medida localmente; produção tem a mesma função (impressão digital igual).
- F5 não foi observada no site publicado.
- O resultado do probe principal para F1 é intermitente (a corrida depende do instante); o script `race_convite_equipe.mjs` a repete até 30 vezes.
