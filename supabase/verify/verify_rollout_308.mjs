// O passo 308 deixa o banco idêntico ao da migration 0143.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const trgs = async (c) => (await c.query(`select pg_get_triggerdef(t.oid) x from pg_trigger t where not tgisinternal and tgrelid='public.posts'::regclass order by 1`)).rows.map((r) => r.x);
const A = await freshDb("vr308a", { with64: true, max: 143 });
const B = await freshDb("vr308b", { with64: true, max: 142 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
for (const k of ["roda inteiro", "pode rodar de novo"]) { try { await B.c.query(readFileSync(new URL("../rollout/passo-308.sql", import.meta.url), "utf8")); ok(`passo 308 ${k}`, true); } catch (e) { ok(`passo 308 ${k}`, false, e.message); } }
for (const [nm, f] of [["funções", hashes], ["gatilhos de posts", trgs]]) { const a = await f(A.c), b = await f(B.c); ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).slice(0, 3).join(" ## ")}`); }
process.exit(bad ? 1 : 0);
