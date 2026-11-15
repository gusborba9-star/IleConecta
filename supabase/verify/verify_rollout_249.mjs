// Verifica que o passo de produção 249 (rodado 2x) deixa o banco idêntico ao da migration 0119.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 200) : ""}`); if (!c) bad++; };
const A = await freshDb("vf_roll249_a", { with64: true, max: 118 }), B = await freshDb("vf_roll249_b", { with64: true, max: 119 });
ok("bases montadas", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join(" | "));
const sql = readFileSync(new URL("../rollout/passo-249.sql", import.meta.url), "utf8");
let e1 = null, e2 = null; try { await A.c.query(sql); } catch (e) { e1 = e.message; } try { await A.c.query(sql); } catch (e) { e2 = e.message; }
ok("passo 249 roda e roda de novo", !e1 && !e2, e1 || e2);
const snap = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, md5(pg_get_functiondef(p.oid)) h, array(select (acl).grantee::regrole::text||':'||(acl).privilege_type from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl order by 1) acl from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows;
ok("funções e permissões idênticas às da migration", JSON.stringify(await snap(A.c)) === JSON.stringify(await snap(B.c)));
console.log(bad ? "FALHA" : "TUDO OK"); await A.c.end(); await B.c.end(); process.exit(bad ? 1 : 0);
