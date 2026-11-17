// O passo 311 deixa o banco idêntico ao da migration 0146.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const trgs = async (c) => (await c.query(`select pg_get_triggerdef(t.oid) x from pg_trigger t where not tgisinternal and tgrelid='public.posts'::regclass order by 1`)).rows.map((r) => r.x);
const acl = async (c) => (await c.query(`select p.proname||':'||has_function_privilege('anon',p.oid,'execute')||':'||has_function_privilege('authenticated',p.oid,'execute') x from pg_proc p where p.proname in ('post_delete_state','my_post_delete_states','posts_delete_guard') order by 1`)).rows.map((r) => r.x);
const A = await freshDb("vr311a", { with64: true, max: 145 });
await A.c.query(readFileSync(new URL("../migrations/0146_excluir_post_impulsionado_apos_reembolso.sql", import.meta.url), "utf8"));
const B = await freshDb("vr311b", { with64: true, max: 145 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
for (const k of ["roda inteiro", "pode rodar de novo"]) { try { await B.c.query(readFileSync(new URL("../rollout/passo-311.sql", import.meta.url), "utf8")); ok(`passo 311 ${k}`, true); } catch (e) { ok(`passo 311 ${k}`, false, e.message); } }
for (const [nm, f] of [["funções", hashes], ["gatilhos de posts", trgs], ["permissões", acl]]) { const a = await f(A.c), b = await f(B.c); ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).slice(0, 3).join(" ## ")}`); }
process.exit(bad ? 1 : 0);
