// Verifica que os passos 275–277 (rodados 2x) deixam o banco idêntico ao da migration 0128.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll275_a", { with64: true, max: 127 }), B = await freshDb("vf_roll275_b", { with64: true, max: 128 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
let e = null;
for (const n of [275, 276, 277, 275, 276, 277]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const FN = "('platform_seat_refunds_guard','platform_seat_refund_begin','platform_seat_refund_done','platform_seat_refund_fail','platform_seat_refunds_pending','my_seat_refunds','platform_seat_refunded_flag','my_seat_release_schedule')";
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) a from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  cols: (await c.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='platform_seat_refunds' order by ordinal_position`)).rows,
  idx: (await c.query(`select indexdef from pg_indexes where schemaname='public' and tablename='platform_seat_refunds' order by 1`)).rows,
  pol: (await c.query(`select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='platform_seat_refunds' order by 1`)).rows,
  trg: (await c.query(`select tgname, pg_get_triggerdef(oid) d from pg_trigger where tgrelid='public.platform_seat_refunds'::regclass and not tgisinternal order by 1`)).rows,
  tpriv: (await c.query(`select r, has_table_privilege(r, 'public.platform_seat_refunds', 'select') s, has_table_privilege(r, 'public.platform_seat_refunds', 'insert') i, has_table_privilege(r, 'public.platform_seat_refunds', 'update') u, has_table_privilege(r, 'public.platform_seat_refunds', 'delete') d from unnest(array['anon','authenticated']) r order by 1`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]), JSON.stringify(a[k]) === JSON.stringify(b[k]) ? "" : JSON.stringify([a[k], b[k]]).slice(0, 500));
ok("função e tabela existem", a.fn.length === 8 && a.cols.length === 12, `${a.fn.length} funções, ${a.cols.length} colunas`);
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
