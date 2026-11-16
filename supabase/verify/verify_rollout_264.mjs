// Verifica que os passos 258–261 (rodados 2x) deixam o banco idêntico ao da migration 0123.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll264_a", { with64: true, max: 124 }), B = await freshDb("vf_roll264_b", { with64: true, max: 125 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
let e = null;
for (const n of [264, 265, 266, 267, 268, 264, 265, 266, 267, 268]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const FN = "('platform_seat_quote','platform_seat_issue','platform_seat_bought_by_payment','platform_seat_refunded_flag','platform_seat_release_apply_due','my_seat_release_schedule','my_seat_release_undo','my_seat_status','platform_upgrade_issue','platform_house_upgraded_by_payment','platform_billing_tick','admin_set_house_seats')";
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) a from pg_proc p where p.pronamespace='public'::regnamespace and proname in ${FN} order by 1`)).rows,
  trg: (await c.query(`select tgname, pg_get_triggerdef(oid) d, tgenabled from pg_trigger where tgname in ('trg_platform_seat_bought','trg_platform_seat_refunded','trg_platform_house_upgraded') order by 1`)).rows,
  col: (await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='house_extra_seats' order by 1`)).rows,
  con: (await c.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.house_extra_seats'::regclass order by 1`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]));
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
