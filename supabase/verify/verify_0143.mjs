// Verificação LOCAL da migration 0143 (trava de excluir post impulsionado). Uso: node supabase/verify/verify_0143.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0143";
const { c: su, failed } = await freshDb(name, { with64: true, max: 142 });
ok("migrations 0001–0142 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0143_trava_excluir_post_impulsionado.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0143 aplica e reaplica sem erro", e === null, e ?? "");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0143000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, t = "casa") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set display_name=excluded.display_name", [id, t, nm]); };
const O1 = uuid(1), H1 = uuid(11), O2 = uuid(2), H2 = uuid(12), CL = uuid(21);
await mk(O1, "Casa 1"); await mk(O2, "Casa 2"); await mk(CL, "Cliente", "cliente");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa 1','casa-1','maximo'),($3,$4,'Casa 2','casa-2','maximo')", [H1, O1, H2, O2]);
const post = async (h) => (await sv("insert into posts(house_id,kind,content) values ($1,'geral','Axé') returning id", [h])).rows[0].id;
const promo = async (h, p, status) => su.query("insert into promotions(house_id,kind,scope,item_type,item_id,days,amount_cents,authorized_at,status) values ($1,'boost','cidade','post',$2,3,1000,now(),$3)", [h, p, status]);
const del = (uid, id) => as(uid, (c) => q(c, "delete from posts where id=$1", [id]));

const P1 = await post(H1); let r = await del(O1, P1);
ok("a casa exclui o próprio post comum", !r.err && r.n === 1, r.err);
const P2 = await post(H1); await sv("insert into post_likes(post_id,user_id) values ($1,$2)", [P2, CL]); await sv("insert into post_comments(post_id,user_id,text) values ($1,$2,'Lindo')", [P2, CL]);
r = await del(O1, P2);
ok("excluir leva junto curtidas e comentários", !r.err && (await sv("select (select count(*) from post_likes where post_id=$1)::int l, (select count(*) from post_comments where post_id=$1)::int c", [P2])).rows.every((x) => x.l === 0 && x.c === 0), r.err);
for (const st of ["aguardando", "ativa"]) {
  const P = await post(H1); await promo(H1, P, st); r = await del(O1, P);
  ok(`post com impulsionamento ${st}: exclusão recusada com mensagem clara`, /está impulsionada/.test(r.err ?? ""), r.err);
  ok(`…e o post continua lá (${st})`, (await sv("select count(*)::int n from posts where id=$1", [P])).rows[0].n === 1);
}
for (const st of ["encerrada", "cancelada", "reembolsada"]) {
  const P = await post(H1); await promo(H1, P, st); r = await del(O1, P);
  ok(`impulsionamento ${st} não trava a exclusão`, !r.err && r.n === 1, r.err);
}
const PO = await post(H2); r = await del(O1, PO);
ok("outra casa não exclui post alheio (regra do banco)", !r.err && r.n === 0);
const PC = await post(H1); r = await del(CL, PC);
ok("cliente não exclui post de casa", !r.err && r.n === 0);
// administração/SQL (sem usuário logado) e cascata não são travados
const PA = await post(H1); await promo(H1, PA, "ativa");
r = await q(su, "delete from posts where id=$1", [PA]);
ok("SQL da administração (sem usuário logado) não é travado", !r.err && r.n === 1, r.err);
const PX = await post(H2);
r = await q(su, "delete from houses where id=$1", [H2]);
ok("apagar a casa (cascata) leva os posts sem a trava interferir", !r.err && (await sv("select count(*)::int n from posts where id=$1", [PX])).rows[0].n === 0, r.err);
// forma
const acl = await sv("select has_function_privilege('authenticated','public.posts_delete_guard()','execute') u, has_function_privilege('anon','public.posts_delete_guard()','execute') a, (select prosecdef from pg_proc where proname='posts_delete_guard') d, (select proconfig::text from pg_proc where proname='posts_delete_guard') c");
ok("ACL: gatilho não chamável; security definer com search_path fixo", !acl.rows[0].u && !acl.rows[0].a && acl.rows[0].d && /search_path=public/.test(acl.rows[0].c));
// mutação
await su.query("drop trigger posts_delete_guard on posts");
const PM = await post(H1); await promo(H1, PM, "ativa"); r = await del(O1, PM);
ok("MUTAÇÃO: sem o gatilho a exclusão passaria (o teste detectaria)", !r.err && r.n === 1);
await su.query(mig);
const PN = await post(H1); await promo(H1, PN, "ativa"); r = await del(O1, PN);
ok("reaplicar a migration restaura a trava", /está impulsionada/.test(r.err ?? ""));
console.log(`\n${total - bad}/${total} ok`);
await su.end?.(); process.exit(bad ? 1 : 0);
