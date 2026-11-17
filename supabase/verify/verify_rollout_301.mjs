// Os passos 301–303 deixam o banco idêntico ao da migration 0140.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g')) h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const pols = async (c) => (await c.query(`select tablename||'.'||policyname||'='||coalesce(qual,'')||'|'||coalesce(with_check,'') x from pg_policies where schemaname in ('public','storage') order by 1`)).rows.map((r) => r.x);
const A = await freshDb("vr301a", { with64: true, max: 140 });
const B = await freshDb("vr301b", { with64: true, max: 139 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));

for (const n of [301, 302, 303]) { try { await B.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); ok(`passo ${n} roda inteiro`, true); } catch (e) { ok(`passo ${n} roda inteiro`, false, e.message); } }
for (const n of [301, 302, 303]) { try { await B.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); ok(`passo ${n} pode rodar de novo`, true); } catch (e) { ok(`passo ${n} pode rodar de novo`, false, e.message); } }
const ha = await hashes(A.c), hb = await hashes(B.c);
ok("funções idênticas às das migrations", JSON.stringify(ha) === JSON.stringify(hb), `${ha.length} vs ${hb.length}; dif: ${ha.filter((x) => !hb.includes(x)).slice(0, 4).join(",")}`);
ok("políticas idênticas", JSON.stringify(await pols(A.c)) === JSON.stringify(await pols(B.c)));
ok("matriz salva igual ao padrão", (await B.c.query("select value = plan_matrix_default() ok from platform_settings where key='plan_matrix'")).rows[0].ok === true);
process.exit(bad ? 1 : 0);

