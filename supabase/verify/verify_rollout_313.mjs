// Os passos 313 e 314 deixam o banco idêntico ao da migration 0148; o passo 315, ao da 0149.
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const hashes = async (c) => (await c.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, md5(regexp_replace(regexp_replace(p.prosrc,'--[^\\n]*','','g'),'\\s','','g'))||p.prosecdef::text||coalesce(p.proconfig::text,'') h from pg_proc p where p.pronamespace='public'::regnamespace order by 1`)).rows.map((r) => r.k + "=" + r.h);
const cols = async (c) => (await c.query(`select column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') x from information_schema.columns where table_schema='public' and table_name='live_pings' order by 1`)).rows.map((r) => r.x);
const acl = async (c) => (await c.query(`select p.proname||':'||has_function_privilege('anon',p.oid,'execute')||':'||has_function_privilege('authenticated',p.oid,'execute') x from pg_proc p where p.proname like 'live_ping%' order by 1`)).rows.map((r) => r.x);
const trg = async (c) => (await c.query(`select tgrelid::regclass::text||'.'||tgname||':'||tgtype::text x from pg_trigger where tgname like 'trg_live_ping%' order by 1`)).rows.map((r) => r.x);
const pol = async (c) => (await c.query(`select polname||':'||polcmd::text||':'||pg_get_expr(polqual,polrelid) x from pg_policy where polrelid='public.live_pings'::regclass`)).rows.map((r) => r.x);
const idx = async (c) => (await c.query(`select indexdef x from pg_indexes where indexname in ('posts_created_idx','live_pings_pkey') order by 1`)).rows.map((r) => r.x);
const tprv = async (c) => (await c.query(`select grantee||':'||privilege_type x from information_schema.role_table_grants where table_name='live_pings' and grantee in ('anon','authenticated','public') order by 1`)).rows.map((r) => r.x);
const pub = async (c) => (await c.query(`select coalesce(string_agg(tablename, ',' order by tablename), '') x from pg_publication_tables where pubname='supabase_realtime'`)).rows.map((r) => r.x);
const A = await freshDb("vr313a", { with64: true, max: 147 });
const B = await freshDb("vr313b", { with64: true, max: 147 });
for (const c of [A.c, B.c]) await c.query("create publication supabase_realtime; alter publication supabase_realtime add table public.messages, public.service_orders, public.reservations, public.refund_requests");
ok("base aplicada", A.failed.length === 0 && B.failed.length === 0, [...A.failed, ...B.failed].join("|"));
await A.c.query(rd("../migrations/0148_escala_feed_e_avisos_de_atualizacao.sql"));
for (const k of ["roda inteiro", "pode rodar de novo"]) { try { for (const p of [313, 314]) await B.c.query(rd(`../rollout/passo-${p}.sql`)); ok(`passos 313 e 314 ${k}`, true); } catch (e) { ok(`passos 313 e 314 ${k}`, false, e.message); } }
for (const [nm, f] of [["funções", hashes], ["colunas de live_pings", cols], ["permissões das funções", acl], ["gatilhos", trg], ["políticas", pol], ["índices", idx], ["permissões da tabela", tprv], ["tempo real", pub]]) { const a = await f(A.c), b = await f(B.c); ok(`${nm} idênticos aos da migration`, JSON.stringify(a) === JSON.stringify(b), `${a.length} vs ${b.length}; dif: ${a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x))).slice(0, 3).join(" | ")}`); }
await A.c.query(rd("../migrations/0149_retirar_tabelas_do_tempo_real.sql"));
for (const k of ["roda inteiro", "pode rodar de novo"]) { try { await B.c.query(rd("../rollout/passo-315.sql")); ok(`passo 315 ${k}`, true); } catch (e) { ok(`passo 315 ${k}`, false, e.message); } }
{ const a = await pub(A.c), b = await pub(B.c); ok("passo 315: tempo real idêntico ao da migration 0149", JSON.stringify(a) === JSON.stringify(b), `${a} vs ${b}`); }
process.exit(bad ? 1 : 0);
