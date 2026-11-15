// Verifica que os passos de produção 251–255 (rodados 2x) deixam o banco idêntico ao da migration 0121.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll251_a", { with64: true, max: 120 }), B = await freshDb("vf_roll251_b", { with64: true, max: 121 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
let e = null;
for (const n of [251, 252, 253, 254, 255, 251, 252, 253, 254, 255]) {
  try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; }
}
ok("passos 251–255 rodam e rodam de novo", !e, e ?? "");
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows,
  trg: (await c.query(`select tgrelid::regclass::text t, tgname, md5(pg_get_triggerdef(oid)) h from pg_trigger where not tgisinternal and tgname in ('trg_moderation_hidden','trg_moderation_promise') order by 1,2`)).rows,
  pol: (await c.query(`select tablename, policyname, md5(coalesce(qual,'')||coalesce(with_check,'')) h from pg_policies where schemaname='public' and tablename in ('services','events','posts') order by 1,2`)).rows,
  col: (await c.query(`select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public' and (column_name='moderation_hidden' or table_name in ('moderation_flags','moderation_settings')) order by 1,2`)).rows,
  idx: (await c.query(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename like 'moderation_%' order by 1`)).rows,
  rls: (await c.query(`select relname, relrowsecurity from pg_class where relname in ('moderation_flags','moderation_settings') order by 1`)).rows,
  seed: (await c.query(`select count(*)::int n from public.moderation_settings`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]));
ok("6 gatilhos novos", a.trg.length === 6, String(a.trg.length));
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
