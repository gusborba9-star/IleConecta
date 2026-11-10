# Verificações da auditoria §31.3

Reproduz `docs/governanca/AUDITORIA_31_3_RECONCILIACOES.md`. Tudo roda em PostgreSQL 16 local (127.0.0.1:5544, usuário `postgres`); **nada acessa produção**.

| Arquivo | O que faz |
|---|---|
| `probe_rls_equipe_reservas.mjs [63\|67\|69]` | Recria o banco com as migrations até o número dado, aplica os privilégios de `anon`/`authenticated` medidos em produção e roda 122 (até a 0063) , 163 (com a 0067) ou 194 (com a 0069: auditoria da equipe) verificações: leitura anônima, isolamento entre casas, equipe (convite→aceite→pausa→remoção), última vaga, retenção de 15 min, expiração, agendamento simultâneo. Imprime `PASS/FAIL/INFO`. |
| `race_convite_equipe.mjs <banco>` | Cenário A: 30 rodadas de 5 aceites simultâneos do mesmo convite. Cenário B: 30 rodadas de 3 convites diferentes com plano que comporta 1 acesso. Conta as rodadas acima do limite. |
| `fingerprint.sql` | Consulta **somente leitura** que gera a impressão digital (tabelas, funções, políticas, gatilhos). Rode no banco de produção e no banco local e compare as chaves. |

Resultado de referência (2026-11-09):
- Migrations até a 0063 (produção hoje): `117 PASS / 5 FAIL`. Os FAIL são os **achados** F2 (perfis e curtidas legíveis sem login), F1 (convite), F3 (janela de 1 h) e F7 (ritual não ocupa a agenda); corrida do convite em 29–30 de 30 rodadas.
- Com a 0067 (`fix/exec-02-f1-f2-f3-f7`, ainda **não aplicada** em produção): `163 PASS / 0 FAIL`; corrida 0/30 nos dois cenários.
- Testes de mutação (0069: gatilhos de permissões e remoção, política de leitura, ocultar consulta da administração, motivo obrigatório, checagem de administrador, RLS, registro da consulta, retenção; todos detectados). Removendo cada correção da 0067 (trava do convite, trava da casa, janela de 1 h, RLS de perfis/curtidas/`peer_info`, relação casa–cliente, agenda/duração/conflito/trava do ritual) o probe ou a corrida falha.

```
npm i --no-save pg
node supabase/verify/audit/probe_rls_equipe_reservas.mjs 63
node supabase/verify/audit/race_convite_equipe.mjs probe63
```

## F4 — estado do atendimento (0071)
- `node supabase/verify/verify_0071.mjs` (banco local PG16): 85 verificações — permissões das funções e tabelas, estados, equipe com e sem permissão, expiração de 12 h, aviso único sob 8 chamadas simultâneas, "Não perturbe", relatório. `PASSOS=1` aplica os passos 26–30 do rollout em vez da migration.
- `DENO_BIN=... node supabase/verify/e2e/run_assistant_e2e.mjs`: a função `assistant-chat` REAL no Deno sobre o banco local, com modelo simulado: assistente responde, para quando a casa/equipe responde, descarta a resposta numa corrida, dedupe do aviso, 401/403, e implantação sem a migration.
