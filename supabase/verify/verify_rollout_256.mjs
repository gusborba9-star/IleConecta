// Verifica que os passos 256–257 (rodados 2x) deixam o banco idêntico ao da migration 0122.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll256_a", { with64: true, max: 121 }), B = await freshDb("vf_roll256_b", { with64: true, max: 122 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
let e = null;
for (const n of [256, 257, 256, 257]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows,
  col: (await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='admin_announcements' order by 1`)).rows,
  tbl: (await c.query(`select relrowsecurity, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(relacl, acldefault('r', relowner))) acl order by 1) acl from pg_class where relname='admin_announcements'`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]));
ok("tabela criada", a.col.length === 7);
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
