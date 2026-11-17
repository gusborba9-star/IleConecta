// Os passos 304–305 deixam o banco idêntico ao da migration 0141.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const pols = async (c) => (await c.query(`select tablename||'.'||policyname||'='||coalesce(qual,'')||'|'||coalesce(with_check,'') x from pg_policies where schemaname in ('public','storage') order by 1`)).rows.map((r) => r.x);
const cols = async (c) => (await c.query(`select table_name||'.'||column_name||':'||data_type||':'||coalesce(column_default,'')||':'||is_nullable x from information_schema.columns where table_schema='public' and table_name in ('notifications','notification_prefs','social_notice_log') order by 1`)).rows.map((r) => r.x);
const trgs = async (c) => (await c.query(`select pg_get_triggerdef(t.oid) x from pg_trigger t where not tgisinternal and tgrelid in ('public.post_likes'::regclass,'public.post_comments'::regclass,'public.follows'::regclass,'public.notifications'::regclass) order by 1`)).rows.map((r) => r.x);
const idx = async (c) => (await c.query(`select indexdef x from pg_indexes where schemaname='public' and tablename in ('notifications','social_notice_log') order by 1`)).rows.map((r) => r.x);
const cons = async (c) => (await c.query(`select conrelid::regclass||'.'||conname||'='||pg_get_constraintdef(oid) x from pg_constraint where conrelid in ('public.notifications'::regclass,'public.social_notice_log'::regclass) order by 1`)).rows.map((r) => r.x);
const acl = async (c) => (await c.query(`select relname||':'||coalesce(relacl::text,'') x from pg_class where relname='social_notice_log'`)).rows.map((r) => r.x);
const A = await freshDb("vr304a", { with64: true, max: 141 });
const B = await freshDb("vr304b", { with64: true, max: 140 });
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
for (const n of [304, 305]) { try { await B.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); ok(`passo ${n} roda inteiro`, true); } catch (e) { ok(`passo ${n} roda inteiro`, false, e.message); } }
for (const n of [304, 305]) { try { await B.c.query(readFileSync(new URL(`../rollout/passo-${n}.sql`, import.meta.url), "utf8")); ok(`passo ${n} pode rodar de novo`, true); } catch (e) { ok(`passo ${n} pode rodar de novo`, false, e.message); } }
for (const [nm, f] of [["funções (corpo, security definer, search_path)", hashes], ["políticas", pols], ["colunas e padrões", cols], ["gatilhos", trgs], ["índices", idx], ["restrições", cons], ["permissões da tabela interna", acl]]) {
  const a = await f(A.c), b = await f(B.c);
  ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).slice(0, 3).join(" ## ")}`);
}
process.exit(bad ? 1 : 0);
