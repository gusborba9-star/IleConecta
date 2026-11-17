// Os passos 306–307 deixam o banco idêntico ao da migration 0142.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const cols = async (c) => (await c.query(`select column_name||':'||data_type||':'||coalesce(column_default,'')||':'||is_nullable x from information_schema.columns where table_schema='public' and table_name='posts' order by 1`)).rows.map((r) => r.x);
const trgs = async (c) => (await c.query(`select pg_get_triggerdef(t.oid) x from pg_trigger t where not tgisinternal and tgrelid='public.posts'::regclass order by 1`)).rows.map((r) => r.x);
const cons = async (c) => (await c.query(`select conname||'='||pg_get_constraintdef(oid) x from pg_constraint where conrelid='public.posts'::regclass order by 1`)).rows.map((r) => r.x);
const pols = async (c) => (await c.query(`select tablename||'.'||policyname||'='||coalesce(qual,'')||'|'||coalesce(with_check,'') x from pg_policies where schemaname in ('public','storage') order by 1`)).rows.map((r) => r.x);
const A = await freshDb("vr306a", { with64: true, max: 142 });
const B = await freshDb("vr306b", { with64: true, max: 141 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
for (const n of [306, 307]) { try { await B.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); ok(`passo ${n} roda inteiro`, true); } catch (e) { ok(`passo ${n} roda inteiro`, false, e.message); } }
for (const n of [306, 307]) { try { await B.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); ok(`passo ${n} pode rodar de novo`, true); } catch (e) { ok(`passo ${n} pode rodar de novo`, false, e.message); } }
for (const [nm, f] of [["funções (corpo, security definer, search_path)", hashes], ["colunas e padrões de posts", cols], ["gatilhos de posts", trgs], ["restrições de posts", cons], ["políticas", pols]]) {
  const a = await f(A.c), b = await f(B.c);
  ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).slice(0, 3).join(" ## ")}`);
}
ok("matriz salva igual ao padrão", (await B.c.query("select value = plan_matrix_default() ok from platform_settings where key='plan_matrix'")).rows[0].ok === true);
process.exit(bad ? 1 : 0);
