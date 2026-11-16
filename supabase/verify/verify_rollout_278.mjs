// Verifica que os passos 278–280 (rodados 2x) deixam o banco idêntico ao da migration 0129.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll278_a", { with64: true, max: 128 }), B = await freshDb("vf_roll278_b", { with64: true, max: 129 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
let e = null;
for (const n of [278, 279, 280, 278, 279, 280]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const FN = "('pending_deadline_hours','admin_pending_center','admin_review_report_keep','report_review','admin_reported_reviews')";
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) a from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  cols: (await c.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='reviews' order by ordinal_position`)).rows,
  tables: (await c.query(`select count(*)::int n from information_schema.tables where table_schema='public'`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]), JSON.stringify(a[k]) === JSON.stringify(b[k]) ? "" : JSON.stringify([a[k], b[k]]).slice(0, 500));
ok("5 funções e a coluna nova existem", a.fn.length === 5 && a.cols.some((c) => c.column_name === "report_reviewed_at"), `${a.fn.length} funções`);
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
