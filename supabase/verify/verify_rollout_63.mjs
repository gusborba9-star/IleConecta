// Verifica que os passos de produção da matriz (63 em diante), rodados 2x cada em ordem, deixam o banco idêntico ao da migration 0085.
// Uso: node supabase/verify/verify_rollout_63.mjs   (PG em 127.0.0.1:5544)
import { readFileSync, readdirSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const ROLL = new URL("../rollout/", import.meta.url).pathname;
const passos = readdirSync(ROLL).filter((f) => /^passo-(6[3-9]|[7-9]\d)\.sql$/.test(f) && readFileSync(ROLL + f, "utf8").includes("0085_matriz_de_planos")).sort();
const A = await freshDb("vf_roll85_a", { with64: true, max: 84 });
const B = await freshDb("vf_roll85_b", { with64: true, max: 85 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
ok(`passos encontrados: ${passos.join(", ")}`, passos.length >= 1);
for (const f of passos) {
  const sql = readFileSync(ROLL + f, "utf8"); let e1 = null, e2 = null;
  try { await A.c.query(sql); } catch (e) { e1 = e.message; }
  try { await A.c.query(sql); } catch (e) { e2 = e.message; }
  ok(`${f} roda sem erro e roda de novo`, !e1 && !e2, e1 || e2);
}
const FN = ["plan_matrix_default", "plan_matrix_ok", "plan_matrix", "plan_cap_int", "plan_cap_bool", "admin_set_setting", "campaign_plan_limit", "quick_reply_plan_limit", "my_campaign_days", "conversation_has_premium_house", "member_my_house", "calendar_premium_limits", "house_seat_allowance", "staff_perm", "ritual_video_enabled"];
const snap = async (c) => JSON.stringify({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, p.prosecdef sd, p.provolatile v,
     array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl
     from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = any($1) order by 1`, [FN])).rows,
  con: (await c.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='platform_settings_key_check'`)).rows,
  cfg: (await c.query(`select key, value from platform_settings where key='plan_matrix'`)).rows,
});
const [sa, sb] = [await snap(A.c), await snap(B.c)];
ok("funções (definição, permissões, volatilidade), restrição de chaves e matriz gravada idênticas", sa === sb, JSON.parse(sa).fn.length + " funções");
await A.c.end(); await B.c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);
