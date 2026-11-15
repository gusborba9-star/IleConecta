// Verifica que os passos 258–261 (rodados 2x) deixam o banco idêntico ao da migration 0123.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll258_a", { with64: true, max: 122 }), B = await freshDb("vf_roll258_b", { with64: true, max: 123 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
let e = null;
for (const n of [258, 259, 260, 261, 258, 259, 260, 261]) { try { await A.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); } catch (x) { e = `passo ${n}: ${x.message}`; break; } }
ok("passos rodam e rodam de novo", !e, e ?? "");
const snap = async (c) => ({
  fn: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace='public'::regnamespace and proname in ('billing_config_ok','platform_pix_discount','platform_charge_issue','platform_charge_payable','platform_charge_attach','platform_ref_expected','platform_charge_confirm','platform_billing_notice') order by 1`)).rows,
  acl: (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl from pg_proc p where p.pronamespace='public'::regnamespace and proname in ('platform_pix_discount','platform_charge_payable','platform_charge_attach','platform_ref_expected') order by 1`)).rows,
  col: (await c.query(`select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public' and ((table_name='platform_charges' and column_name like 'pix_%') or (table_name='platform_charge_refs' and column_name='amount_cents')) order by 1,2`)).rows,
  con: (await c.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('platform_charges_pix_discount_lt_amount','platform_charge_refs_amount_pos') order by 1`)).rows,
  attach: (await c.query(`select count(*)::int n from pg_proc where proname='platform_charge_attach'`)).rows,
});
const [a, b] = [await snap(A.c), await snap(B.c)];
for (const k of Object.keys(a)) ok(`${k} idêntico`, JSON.stringify(a[k]) === JSON.stringify(b[k]));
ok("só existe uma versão de platform_charge_attach", a.attach[0].n === 1);
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
