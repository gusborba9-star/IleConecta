// Verificação LOCAL da migration 0150 (contagem de comentários do feed). Uso: node supabase/verify/verify_0150.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0150";
const { c: su, failed } = await freshDb(name, { with64: true, max: 149 });
ok("migrations 0001–0149 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0150_contagem_de_comentarios_do_feed.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0150 aplica e reaplica sem erro", e === null, e ?? "");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const U = (n) => `a0150000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2, 3, 4]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city,state,country) values ($1,$2,$3,'Salvador','BA','BR') on conflict (id) do update set account_type=$2", [U(n), n === 1 ? "casa" : "cliente", `Pessoa ${n}`]); }
const H = "b0150000-0000-0000-0000-000000000001";
await sv("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa','casa','maximo')", [H, U(1)]);
const P = [], mk = async () => (await sv("insert into posts(house_id,kind,content) values ($1,'geral','x') returning id", [H])).rows[0].id;
const P1 = await mk(), P2 = await mk(), P3 = await mk();
// P1: 3 comentários (1 oculto, escrito por 3); P2: nenhum; P3: 2
await sv("insert into post_comments(post_id,user_id,text) values ($1,$2,'a'),($1,$3,'b'),($1,$4,'c oculto')", [P1, U(2), U(2), U(3)]);
await sv("update post_comments set hidden_by_house=true where text='c oculto'");
await sv("insert into post_comments(post_id,user_id,text) values ($1,$2,'d'),($1,$3,'e')", [P3, U(2), U(4)]);
const counts = async (uid, role, ids = [P1, P2, P3]) => as(uid, async (c) => Object.fromEntries((await c.query("select post_id, n from post_comment_counts($1::uuid[])", [ids])).rows.map((r) => [r.post_id, r.n])), role);
const c4 = await counts(U(4));
ok("cliente de fora conta só os comentários visíveis (oculto não entra)", c4[P1] === 2 && c4[P3] === 2 && P2 in c4 === false, JSON.stringify(c4));
const c3 = await counts(U(3));
ok("quem escreveu o comentário oculto conta o próprio", c3[P1] === 3, JSON.stringify(c3));
const c1 = await counts(U(1));
ok("a casa dona conta todos, inclusive o oculto", c1[P1] === 3 && c1[P3] === 2, JSON.stringify(c1));
const ca = await counts(null, "anon");
ok("visitante sem conta conta só os visíveis", ca[P1] === 2, JSON.stringify(ca));
// a contagem confere com a lista que cada um lê
for (const [uid, rotulo] of [[U(4), "cliente"], [U(3), "autor do oculto"], [U(1), "casa"]]) {
  const r = await as(uid, async (c) => ({ n: (await c.query("select count(*)::int n from post_comments where post_id=$1", [P1])).rows[0].n, k: (await c.query("select n from post_comment_counts(array[$1::uuid])", [P1])).rows[0]?.n }));
  ok(`contagem = lista lida (${rotulo})`, r.n === r.k, JSON.stringify(r));
}
const big = await as(U(4), (c) => q(c, "select * from post_comment_counts((select array_agg(gen_random_uuid()) from generate_series(1,201)))"));
ok("mais de 200 publicações de uma vez: nada volta (limite como o das curtidas)", !big.err && big.rows.length === 0, big.err);
const empty = await as(U(4), (c) => q(c, "select * from post_comment_counts('{}'::uuid[])"));
ok("lista vazia não dá erro", !empty.err && empty.rows.length === 0, empty.err);
const nul = await as(U(4), (c) => q(c, "select * from post_comment_counts(null)"));
ok("lista nula não dá erro nem devolve nada", !nul.err && nul.rows.length === 0, nul.err);
const acl = await sv("select has_function_privilege('anon','post_comment_counts(uuid[])','execute') a, has_function_privilege('authenticated','post_comment_counts(uuid[])','execute') b, p.prosecdef from pg_proc p where proname='post_comment_counts'");
ok("função roda com os direitos de quem chama (não é SECURITY DEFINER)", acl.rows[0].prosecdef === false);
// comentário que a casa passa a ocultar muda a contagem do cliente
await sv("update post_comments set hidden_by_house=true where text='a'");
const after = await counts(U(4));
ok("ocultar um comentário reduz a contagem de quem não pode vê-lo", after[P1] === 1, JSON.stringify(after));
await sv("update post_comments set hidden_by_house=false where text='a'");
console.log(`\n${total - bad}/${total} ok`); await su.end(); process.exit(bad ? 1 : 0);
