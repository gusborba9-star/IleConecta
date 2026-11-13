// Verifica que os passos de produção 159–164 (rodados 2x cada, em ordem) deixam o banco idêntico ao da migration 0099.
// Uso: node supabase/verify/verify_rollout_159.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const ROLL = new URL("../rollout/", import.meta.url).pathname;
const A = await freshDb("vf_roll159_a", { with64: true, max: 98 });   // produção até a 0098
const B = await freshDb("vf_roll159_b", { with64: true, max: 99 });   // referência: migrations 0001–0099
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
for (let n = 159; n <= 164; n++) {
  const sql = readFileSync(`${ROLL}passo-${n}.sql`, "utf8");
  let e1 = null, e2 = null;
  try { await A.c.query(sql); } catch (e) { e1 = e.message; }
  try { await A.c.query(sql); } catch (e) { e2 = e.message; }
  ok(`passo ${n} roda sem erro e roda de novo`, !e1 && !e2, e1 || e2);
}
const T = ["platform_charges", "house_billing_plan"];
const snap = async (c) => {
  const fn = (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, p.prosecdef sd, p.provolatile v,
      array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl
    from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows;
  const cols = (await c.query(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name = any($1) order by 1, ordinal_position`, [T])).rows;
  const con = (await c.query(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid = any (select ('public.'||x)::regclass from unnest($1::text[]) x) order by 1,2`, [T])).rows;
  const idx = (await c.query(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename = any($1) order by 1,2`, [T])).rows;
  const trg = (await c.query(`select tgrelid::regclass::text t, tgname, md5(pg_get_triggerdef(oid)) h from pg_trigger where not tgisinternal and tgrelid = any (select ('public.'||x)::regclass from unnest($1::text[]) x) order by 1,2`, [T])).rows;
  const pol = (await c.query(`select tablename, policyname, cmd, roles::text, qual from pg_policies where tablename = any($1) order by 1,2`, [T])).rows;
  const rls = (await c.query(`select relname, relrowsecurity from pg_class where relname = any($1) order by 1`, [T])).rows;
  const tg = (await c.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name = any($1) and grantee in ('anon','authenticated') order by 1,2,3`, [T])).rows;
  return { fn, cols, con, idx, trg, pol, rls, tg };
};
const [sa, sb] = [await snap(A.c), await snap(B.c)];
ok("todas as funções do schema public existem nas duas bases", sa.fn.length === sb.fn.length && sa.fn.length > 100, `${sa.fn.length}/${sb.fn.length}`);
for (const k of Object.keys(sa)) ok(`idêntico: ${k}`, JSON.stringify(sa[k]) === JSON.stringify(sb[k]), k === "fn" ? sa.fn.filter((x, i) => JSON.stringify(x) !== JSON.stringify(sb.fn[i])).map((x) => x.sig).join(",") : "");
ok("as novas funções existem", ["platform_reactivation_issue", "platform_house_reactivated_by_payment"].every((n) => sa.fn.some((f) => f.sig.startsWith(n + "("))));
await A.c.end(); await B.c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);
