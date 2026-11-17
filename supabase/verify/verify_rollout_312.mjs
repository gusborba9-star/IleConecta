// O passo 312 deixa o banco idêntico ao da migration 0147.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const cols = async (c) => (await c.query(`select column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') x from information_schema.columns where table_schema='public' and table_name='promotions' order by 1`)).rows.map((r) => r.x);
const acl = async (c) => (await c.query(`select p.proname||':'||has_function_privilege('anon',p.oid,'execute')||':'||has_function_privilege('authenticated',p.oid,'execute') x from pg_proc p where p.proname in ('house_set_post_delete_after_refund','platform_promo_refund_done','platform_promo_refund_fail') order by 1`)).rows.map((r) => r.x);
const A = await freshDb("vr312a", { with64: true, max: 146 });
await A.c.query(readFileSync(new URL("../migrations/0147_cancelar_agora_exclui_publicacao.sql", import.meta.url), "utf8"));
const B = await freshDb("vr312b", { with64: true, max: 146 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
for (const k of ["roda inteiro", "pode rodar de novo"]) { try { await B.c.query(readFileSync(new URL("../rollout/passo-312.sql", import.meta.url), "utf8")); ok(`passo 312 ${k}`, true); } catch (e) { ok(`passo 312 ${k}`, false, e.message); } }
for (const [nm, f] of [["funções", hashes], ["colunas de promotions", cols], ["permissões", acl]]) { const a = await f(A.c), b = await f(B.c); ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).slice(0, 3).join(" ## ")}`); }
process.exit(bad ? 1 : 0);
