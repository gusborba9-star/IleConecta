// Verifica que os passos 290–293 (rodados 2x, na ordem) deixam o banco idêntico ao da migration 0134.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll290_a", { with64: true, max: 133 }), B = await freshDb("vf_roll290_b", { with64: true, max: 134 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
// uma casa e uma pessoa já existentes, para conferir o preenchimento do histórico e dos dias
for (const c of [A.c, B.c]) {
  await c.query("insert into auth.users(id,email) values ('a0134111-0000-0000-0000-000000000001','x@x.com')");
}
let e = null;
for (const n of [290, 291, 292, 293, 290, 291, 292, 293]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam na ordem e rodam de novo", !e, e ?? "");
const FN = "('log_house_plan_change','touch_presence','anonymize_account','export_my_data','admin_indicators')";
const TB = "('house_plan_history','user_activity_days')";
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) a from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  tables: (await c.query(`select count(*)::int n from information_schema.tables where table_schema='public'`)).rows,
  cols: (await c.query(`select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name in ${TB} order by 1,2`)).rows,
  tacl: (await c.query(`select c.relname, c.relrowsecurity rls, coalesce(array_to_string(c.relacl, ','), '') acl from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ${TB} order by 1`)).rows,
  idx: (await c.query(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename in ${TB} order by 1`)).rows,
  trg: (await c.query(`select tgname, pg_get_triggerdef(t.oid) d from pg_trigger t where tgname = 'trg_houses_plan_history' and not tgisinternal`)).rows,
  chk: (await c.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid in ('public.house_plan_history'::regclass,'public.user_activity_days'::regclass) order by 1`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]), JSON.stringify(a[k]) === JSON.stringify(b[k]) ? "" : JSON.stringify([a[k], b[k]]).slice(0, 600));
ok("as 5 funções, as 2 tabelas e o gatilho existem", a.fn.length === 5 && a.cols.length >= 8 && a.trg.length === 1 && a.tacl.length === 2 && a.tacl.every((t) => t.rls), JSON.stringify([a.fn.length, a.cols.length, a.trg.length]));
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
