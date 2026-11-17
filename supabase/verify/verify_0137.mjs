// Verificação LOCAL da migration 0137 (histórico com "quem fez"). Uso: node supabase/verify/verify_0137.mjs  (PG em 127.0.0.1:5544; bash /tmp/pgup.sh)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0137";
const { c: su, failed } = await freshDb(name, { with64: true, max: 136 });
ok("migrations 0001–0136 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0137_auditoria_quem_fez.sql", import.meta.url), "utf8");
const tablesBefore = (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n;
let e0 = null; try { await su.query(mig); await su.query(mig); } catch (e) { e0 = e.message; }
ok("0137 aplica e reaplica sem erro", e0 === null, e0 ?? "");
ok("não cria tabela nova", (await su.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n === tablesBefore);
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `a0137000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const A1 = uuid(1), A2 = uuid(2), A3 = uuid(3), NO = uuid(9);
const mk = async (id, nm) => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,'cliente',$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm]); };
await mk(A1, "Gustavo Dono"); await mk(A2, "Ana Suporte"); await mk(A3, "  "); await mk(NO, "Qualquer Pessoa");
await su.query("insert into admins(user_id) values ($1),($2),($3)", [A1, A2, A3]);
for (let i = 1; i <= 120; i++) await su.query("insert into admin_audit(admin_id,key,old_value,new_value) values ($1,$2,'{\"segredo\":\"V\"}','{\"segredo\":\"N\"}')", [i % 3 === 0 ? A3 : i % 2 ? A1 : A2, i % 2 ? "pricing" : "features"]);
const feed = (uid, lim, before) => as(uid, async (c) => { const r = await q(c, "select public.admin_audit_feed($1,$2) f", [lim ?? 50, before ?? null]); return r.err ? { err: r.err } : r.rows[0].f; });

const f1 = await feed(A1, 50);
ok("administrador lê; vem do mais novo ao mais antigo, 50 por página", Array.isArray(f1) && f1.length === 50 && f1.every((x, i) => i === 0 || x.id < f1[i - 1].id));
ok("mostra quem fez: nome do perfil", f1.some((x) => x.actor === "Gustavo Dono") && f1.some((x) => x.actor === "Ana Suporte"));
ok("sem perfil, cai no e-mail (nunca vazio)", f1.some((x) => x.admin_id === A3 && x.actor === `u${A3.slice(-2)}@x.com`));
ok("não devolve valor antigo/novo", !JSON.stringify(f1).includes("segredo"));
ok("cada linha tem actor e admin_id coerentes com o banco", (await sv("select id, admin_id from admin_audit")).rows.every((r) => { const x = f1.find((y) => y.id === Number(r.id)); return !x || x.admin_id === r.admin_id; }));
let before = null, walk = [], pages = 0; do { const p = await feed(A2, 50, before); walk.push(...p); before = p.length === 50 ? p[p.length - 1].id : null; pages++; } while (before && pages < 10);
ok("paginar pega as 120 linhas sem perder nem repetir", walk.length === 120 && new Set(walk.map((x) => x.id)).size === 120, `${walk.length}`);
ok("limite 0 vira 1; 9999 vira 200", (await feed(A1, 0)).length === 1 && (await feed(A1, 9999)).length === 120);
const rec = await feed(NO, 50); ok("quem não é administrador é recusado", /not_admin/.test(rec.err ?? ""));
const anon = await (async () => { const c = await connect(name); try { await c.query("set role anon"); return await q(c, "select public.admin_audit_feed(5,null)"); } finally { await c.end(); } })();
ok("anônimo sem permissão de executar", /permission denied/.test(anon.err ?? ""), anon.err);
const acl = await sv("select has_function_privilege('anon','public.admin_audit_feed(integer,bigint)','execute') a, has_function_privilege('public','public.admin_audit_feed(integer,bigint)','execute') p, has_function_privilege('authenticated','public.admin_audit_feed(integer,bigint)','execute') u");
ok("ACL: só authenticated executa", !acl.rows[0].a && !acl.rows[0].p && acl.rows[0].u);
const fn = await sv("select prosecdef d, proconfig c from pg_proc where proname='admin_audit_feed'");
ok("security definer, search_path fixo", fn.rows[0].d === true && /search_path=public/.test(String(fn.rows[0].c)));
const before1 = (await sv("select count(*)::int n from admin_audit")).rows[0].n; await feed(A1, 50);
ok("consultar não grava nada", (await sv("select count(*)::int n from admin_audit")).rows[0].n === before1);
// administrador removido do auth: não quebra
await su.query("delete from admins where user_id=$1", [A3]); await su.query("update admin_audit set admin_id=null where admin_id=$1", [A3]).catch(() => {});
const f2 = await feed(A1, 200); ok("autor sem registro ainda lista a linha", Array.isArray(f2) && f2.length === 120);
// adulteração: ninguém muda o histórico pelo cliente
const tamper = await as(A1, (c) => q(c, "update admin_audit set admin_id=$1 where id=(select min(id) from admin_audit)", [A2]));
const tamper2 = await as(A1, (c) => q(c, "delete from admin_audit"));
const left = (await sv("select count(*)::int n, bool_or(admin_id=$1) moved from admin_audit", [A2])).rows[0];
ok("pelo cliente ninguém altera nem apaga o histórico", left.n === 120 && tamper.rows?.length === 0, `${left.n} linhas`);
console.log(`\n${total - bad}/${total} ok`);
await su.end?.(); process.exit(bad ? 1 : 0);
