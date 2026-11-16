// Verifica que os passos 273–274 (rodados 2x) deixam o banco idêntico ao da migration 0127.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll273_a", { with64: true, max: 126 }), B = await freshDb("vf_roll273_b", { with64: true, max: 127 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
for (const X of [A, B]) await X.c.query("insert into vault.secrets(name, secret) values ('tax_id_key','k') on conflict do nothing");
let e = null;
for (const n of [273, 274, 273, 274]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const FN = "('tax_id_norm','tax_id_kind','tax_id_format','tax_id_store','platform_seat_release_apply_due','house_seat_allowance')";
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) a from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  tpriv: (await c.query(`select t, r, has_table_privilege(r, 'public.'||t, 'insert') i, has_table_privilege(r, 'public.'||t, 'update') u, has_table_privilege(r, 'public.'||t, 'delete') d from unnest(array['house_extra_seats','platform_settings']) t, unnest(array['anon','authenticated']) r order by 1,2`).catch(() => ({ rows: [] }))).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]), JSON.stringify(a[k]) === JSON.stringify(b[k]) ? "" : JSON.stringify([a[k], b[k]]).slice(0, 400));
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
