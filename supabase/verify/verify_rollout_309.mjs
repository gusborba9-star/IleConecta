// O passo 309 deixa o banco idêntico ao da migration 0144.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const trgs = async (c) => (await c.query(`select pg_get_triggerdef(t.oid) x from pg_trigger t where not tgisinternal and tgrelid='public.posts'::regclass order by 1`)).rows.map((r) => r.x);
const trgsC = async (c) => (await c.query(`select pg_get_triggerdef(t.oid) x from pg_trigger t where not tgisinternal and tgrelid='public.post_comments'::regclass order by 1`)).rows.map((r) => r.x);
const pols = async (c) => (await c.query(`select policyname||':'||cmd||':'||coalesce(regexp_replace(qual,'\\s','','g'),'') x from pg_policies where tablename='post_comments' order by 1`)).rows.map((r) => r.x);
const cols = async (c) => (await c.query(`select table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') x from information_schema.columns where table_schema='public' and table_name in ('posts','post_comments') order by 1`)).rows.map((r) => r.x);
const A = await freshDb("vr309a", { with64: true, max: 143 });
await A.c.query(readFileSync(new URL("../migrations/0144_editar_post_e_moderar_comentarios.sql", import.meta.url), "utf8"));
const B = await freshDb("vr309b", { with64: true, max: 143 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
for (const k of ["roda inteiro", "pode rodar de novo"]) { try { await B.c.query(readFileSync(new URL("../rollout/passo-309.sql", import.meta.url), "utf8")); ok(`passo 309 ${k}`, true); } catch (e) { ok(`passo 309 ${k}`, false, e.message); } }
for (const [nm, f] of [["funções", hashes], ["gatilhos de posts", trgs], ["gatilhos de comentários", trgsC], ["políticas de comentários", pols], ["colunas novas", cols]]) { const a = await f(A.c), b = await f(B.c); ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).slice(0, 3).join(" ## ")}`); }
process.exit(bad ? 1 : 0);
