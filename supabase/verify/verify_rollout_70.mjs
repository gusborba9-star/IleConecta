// Verifica que os passos de produção 70–75 (rodados 2x cada, em ordem) deixam o banco idêntico ao da migration 0087.
// Uso: node supabase/verify/verify_rollout_70.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const ROLL = new URL("../rollout/", import.meta.url).pathname;
const A = await freshDb("vf_roll70_a", { with64: true, max: 86 });   // produção hoje: até a 0086
const B = await freshDb("vf_roll70_b", { with64: true, max: 87 });   // referência: migrations 0001–0087
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
for (const n of [70, 71, 72, 73, 74, 75]) {
  const sql = readFileSync(`${ROLL}passo-${n}.sql`, "utf8");
  let e1 = null, e2 = null;
  try { await A.c.query(sql); } catch (e) { e1 = e.message; }
  try { await A.c.query(sql); } catch (e) { e2 = e.message; }
  ok(`passo ${n} roda sem erro e roda de novo`, !e1 && !e2, e1 || e2);
}
const snap = async (c) => {
  const fn = (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, p.prosecdef sd, p.provolatile v,
      array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl
    from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('billing_config_default','billing_config_ok','billing_prices_default','billing_prices_ok','platform_billing_config','platform_billing_prices','billing_is_business_day','billing_add_business_days','admin_set_billing_holiday','admin_set_setting') order by 1`)).rows;
  const con = (await c.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='platform_settings_key_check'`)).rows;
  const set = (await c.query(`select key, value from platform_settings where key in ('billing_config','billing_prices') order by key`)).rows;
  const hol = (await c.query(`select count(*) n, md5(string_agg(day::text||name, ',' order by day)) h from billing_holidays`)).rows;
  const rls = (await c.query(`select relrowsecurity r from pg_class where relname='billing_holidays'`)).rows;
  const pol = (await c.query(`select policyname, cmd, roles::text from pg_policies where tablename='billing_holidays'`)).rows;
  const tg = (await c.query(`select grantee, privilege_type from information_schema.role_table_grants where table_name='billing_holidays' and grantee in ('anon','authenticated') order by 1,2`)).rows;
  return JSON.stringify({ fn, con, set, hol, rls, pol, tg });
};
const [sa, sb] = [await snap(A.c), await snap(B.c)];
const pa = JSON.parse(sa), pb = JSON.parse(sb);
ok("10 funções existem nas duas bases", pa.fn.length === 10 && pb.fn.length === 10, pa.fn.length);
ok("funções (inclui admin_set_setting), permissões e volatilidade idênticas", JSON.stringify(pa.fn) === JSON.stringify(pb.fn), pa.fn.filter((x, i) => x.h !== pb.fn[i]?.h).map((x) => x.sig).join(","));
ok("trava de chaves idêntica", JSON.stringify(pa.con) === JSON.stringify(pb.con), JSON.stringify(pa.con));
ok("configuração e preços iniciais idênticos", JSON.stringify(pa.set) === JSON.stringify(pb.set));
ok("feriados idênticos (30)", JSON.stringify(pa.hol) === JSON.stringify(pb.hol) && pa.hol[0].n === "30", JSON.stringify(pa.hol));
ok("RLS, política e permissões da tabela de feriados idênticas", JSON.stringify([pa.rls, pa.pol, pa.tg]) === JSON.stringify([pb.rls, pb.pol, pb.tg]), JSON.stringify([pa.pol, pa.tg]));
await A.c.end(); await B.c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);
