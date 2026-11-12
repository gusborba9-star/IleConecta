// Verifica que os passos de produção 66–68 (rodados 2x cada, em ordem) deixam o banco idêntico ao da migration 0086.
// Uso: node supabase/verify/verify_rollout_66.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const ROLL = new URL("../rollout/", import.meta.url).pathname;
const A = await freshDb("vf_roll66_a", { with64: true, max: 85 });   // produção hoje: até a 0085
const B = await freshDb("vf_roll66_b", { with64: true, max: 86 });   // referência: migrations 0001–0086
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
for (const n of [66, 67, 68]) {
  const sql = readFileSync(`${ROLL}passo-${n}.sql`, "utf8");
  let e1 = null, e2 = null;
  try { await A.c.query(sql); } catch (e) { e1 = e.message; }
  try { await A.c.query(sql); } catch (e) { e2 = e.message; }
  ok(`passo ${n} roda sem erro e roda de novo`, !e1 && !e2, e1 || e2);
}
const snap = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, p.prosecdef sd, p.provolatile v,
    array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('admin_finance_summary','admin_finance_anomalies') order by 1`)).rows;
const [sa, sb] = [await snap(A.c), await snap(B.c)];
ok("as 2 funções existem", sa.length === 2 && sb.length === 2);
ok("definição, segurança e permissões idênticas às da migration", JSON.stringify(sa) === JSON.stringify(sb), JSON.stringify(sa.map((x) => [x.sig, x.acl])));
ok("anon sem acesso; authenticated com acesso", sa.every((x) => !x.acl.some((a) => a.startsWith("anon:")) && x.acl.some((a) => a.startsWith("authenticated:"))), JSON.stringify(sa.map((x) => x.acl)));
await A.c.end(); await B.c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);
