# Verificações da auditoria §31.3

Reproduz `docs/governanca/AUDITORIA_31_3_RECONCILIACOES.md`. Tudo roda em PostgreSQL 16 local (127.0.0.1:5544, usuário `postgres`); **nada acessa produção**.

| Arquivo | O que faz |
|---|---|
| `probe_rls_equipe_reservas.mjs [63\|66]` | Recria o banco com as migrations até o número dado, aplica os privilégios de `anon`/`authenticated` medidos em produção e roda 121 verificações: leitura anônima, isolamento entre casas, equipe (convite→aceite→pausa→remoção), última vaga, retenção de 15 min, expiração, agendamento simultâneo. Imprime `PASS/FAIL/INFO`. |
| `race_convite_equipe.mjs <banco>` | Repete 30 vezes 5 aceites simultâneos do mesmo convite e conta as rodadas com mais de um vínculo. |
| `fingerprint.sql` | Consulta **somente leitura** que gera a impressão digital (tabelas, funções, políticas, gatilhos). Rode no banco de produção e no banco local e compare as chaves. |

Resultado de referência (2026-11-09): `118 PASS / 3 FAIL` (perfis legíveis sem login, curtidas legíveis, janela de 1 h do ritual) e corrida do convite em 29–30 de 30 rodadas. Os FAIL são **achados** (F2, F3, F1); os testes passam a ficar verdes quando as correções forem feitas.

```
npm i --no-save pg
node supabase/verify/audit/probe_rls_equipe_reservas.mjs 63
node supabase/verify/audit/race_convite_equipe.mjs probe63
```
