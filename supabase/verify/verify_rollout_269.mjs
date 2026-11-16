// Verifica que os passos 258–261 (rodados 2x) deixam o banco idêntico ao da migration 0123.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll269_a", { with64: true, max: 125 }), B = await freshDb("vf_roll269_b", { with64: true, max: 126 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
await A.c.query("insert into vault.secrets(name, secret) values ('tax_id_key','k')"); await B.c.query("insert into vault.secrets(name, secret) values ('tax_id_key','k')");
let e = null;
for (const n of [269, 270, 271, 272, 269, 270, 271, 272]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const FN = "('tax_id_kind','tax_id_format','tax_id_key','platform_require_tax_id','tax_id_store','my_tax_id_set','my_tax_id_status','admin_house_tax_id','admin_house_tax_id_set','platform_subscribe_issue','platform_reactivation_issue','platform_upgrade_issue','platform_seat_issue')";
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) a from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  col: (await c.query(`select table_name, column_name, data_type from information_schema.columns where table_schema='public' and table_name in ('house_tax_ids','tax_id_access_log') order by 1,2`)).rows,
  con: (await c.query(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid in ('public.house_tax_ids'::regclass,'public.tax_id_access_log'::regclass) order by 1,2`)).rows,
  rls: (await c.query(`select relname, relrowsecurity from pg_class where relname in ('house_tax_ids','tax_id_access_log') order by 1`)).rows,
  tacl: (await c.query(`select relname, coalesce(relacl::text,'') a from pg_class where relname in ('house_tax_ids','tax_id_access_log') order by 1`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]));
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
