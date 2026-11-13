// Verifica que os passos de produção 60–62 (rodados 2x cada, em ordem) deixam o banco idêntico ao das migrations 0083 e 0084.
// Uso: node supabase/verify/verify_rollout_60_62.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const ROLL = new URL("../rollout/", import.meta.url).pathname;
const A = await freshDb("vf_roll_a", { with64: true, max: 82 });   // produção hoje: até a 0082
const B = await freshDb("vf_roll_b", { with64: true, max: 84 });   // referência: migrations 0001–0084
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
for (const n of [60, 61, 62]) {
  const sql = readFileSync(`${ROLL}passo-${n}.sql`, "utf8");
  let e1 = null, e2 = null;
  try { await A.c.query(sql); } catch (e) { e1 = e.message; }
  try { await A.c.query(sql); } catch (e) { e2 = e.message; }
  ok(`passo ${n} roda sem erro e roda de novo`, !e1 && !e2, e1 || e2);
}
const snap = async (c) => {
  const fn = (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, p.prosecdef sd, p.provolatile v,
      array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl
    from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('fee_cents','current_fee_rules','fee_rates_ok','payments_stamp_fee_rule','admin_set_fee_rules','fee_rule_versions_immutable') order by 1`)).rows;
  const cols = (await c.query(`select column_name, data_type, is_nullable from information_schema.columns where table_name='fee_rule_versions' order by ordinal_position`)).rows;
  const trg = (await c.query(`select tgname, tgrelid::regclass::text t from pg_trigger where not tgisinternal and tgname in ('trg_payments_stamp_fee_rule','trg_fee_rule_versions_immutable') order by 1`)).rows;
  const price = (await c.query(`select value #>> '{plans,intermediario,monthly}' i, value #>> '{plans,maximo,monthly}' m from platform_settings where key='pricing'`)).rows;
  const rules = (await c.query(`select version, rates from fee_rule_versions order by seq`)).rows;
  return JSON.stringify({ fn, cols, trg, price, rules });
};
const [sa, sb] = [await snap(A.c), await snap(B.c)];
const pa = JSON.parse(sa), pb = JSON.parse(sb);
ok("funções, permissões, volatilidade e definição idênticas", JSON.stringify(pa.fn) === JSON.stringify(pb.fn), JSON.stringify(pa.fn.map((x) => x.sig)));
ok("colunas e gatilhos idênticos", JSON.stringify(pa.cols) === JSON.stringify(pb.cols) && JSON.stringify(pa.trg) === JSON.stringify(pb.trg));
ok("regra inicial idêntica", JSON.stringify(pa.rules) === JSON.stringify(pb.rules), JSON.stringify(pa.rules));
ok("preços após os passos iguais aos da referência", JSON.stringify(pa.price) === JSON.stringify(pb.price), JSON.stringify([pa.price, pb.price]));
ok("preços novos 179,9 / 299,9", pa.price[0].i === "179.9" && pa.price[0].m === "299.9");
await A.c.end(); await B.c.end();
console.log(bad ? `\n${bad} FALHA(S)` : "\nTUDO OK"); process.exit(bad ? 1 : 0);
