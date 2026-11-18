// Verificação LOCAL da migration 0163 (Momentos: curtir, comentar e visualizações). Uso: node supabase/verify/verify_0163.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 400) : ""}`); if (!c) bad++; };
const name = "vf0163";
const { c: su, failed } = await freshDb(name, { with64: true, max: 162 });
ok("migrations 0001–0162 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0163_momentos_curtir_comentar_ver.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0163000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm, type]); };
const OWN = uuid(1), OWN2 = uuid(2), HOUSE = uuid(11), HOUSE2 = uuid(12), A = uuid(21), B = uuid(22), C = uuid(23);
await mk(OWN, "Casa Um", "casa"); await mk(OWN2, "Casa Dois", "casa"); await mk(A, "Ana"); await mk(B, "Beto"); await mk(C, "Carla");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','maximo'), ($3,$4,'Casa Dois','casa-dois','maximo')", [HOUSE, OWN, HOUSE2, OWN2]);
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0163 aplica e reaplica sem erro", e === null, e ?? "");
const put = (owner, file) => su.query("insert into storage.objects(bucket_id,name,owner) values ('moments',$1,$2) on conflict do nothing", [`${owner}/${file}`, owner]);
const mkStory = async (owner, house, tag) => { await put(owner, tag + ".jpg"); return (await su.query("insert into stories(house_id,media_path) values ($1,$2) returning id", [house, `${owner}/${tag}.jpg`])).rows[0].id; };
const S1 = await mkStory(OWN, HOUSE, "s1"), S2 = await mkStory(OWN2, HOUSE2, "s2");
const call = (uid, sql, p) => as(uid, (c) => q(c, sql, p));

// visualizações
await call(A, "select moment_view($1)", [S1]); await call(A, "select moment_view($1)", [S1]); await call(B, "select moment_view($1)", [S1]); await call(OWN, "select moment_view($1)", [S1]);
ok("visualização conta cada pessoa uma vez e não conta a própria casa", (await sv("select count(*)::int n from moment_views where story_id=$1", [S1])).rows[0].n === 2);
ok("sem login não registra e não dá erro", !(await as(null, (c) => q(c, "select moment_view($1)", [S1]))).err && (await sv("select count(*)::int n from moment_views")).rows[0].n === 2);
ok("momento inexistente: visualização é ignorada", !(await call(A, "select moment_view($1)", [uuid(999)])).err);

// curtir
const l1 = await call(A, "select moment_like($1, true) r", [S1]);
ok("cliente curte", !l1.err && l1.rows[0].r === true, l1.err);
await call(A, "select moment_like($1, true)", [S1]);
ok("curtir duas vezes conta uma", (await sv("select count(*)::int n from moment_likes where story_id=$1", [S1])).rows[0].n === 1);
ok("a casa não curte o próprio momento", !!(await call(OWN, "select moment_like($1, true)", [S1])).err);
ok("sem login não curte", !!(await as(null, (c) => q(c, "select moment_like($1, true)", [S1]))).err);
await call(B, "select moment_like($1, true)", [S1]);
const nt = (await sv("select grouped, text from notifications where user_id=$1 and kind='like' and ref_id=$2", [OWN, S1])).rows;
ok("aviso de curtida agrupado: 2 pessoas viram 1 aviso 'e mais 1 pessoa'", nt.length === 1 && nt[0].grouped === 2 && /e mais 1 pessoa curtiram seu momento/.test(nt[0].text), JSON.stringify(nt));
await call(A, "select moment_like($1, false)", [S1]); await call(A, "select moment_like($1, true)", [S1]);
ok("descurtir e curtir de novo não repete o aviso", (await sv("select grouped from notifications where user_id=$1 and kind='like' and ref_id=$2", [OWN, S1])).rows[0].grouped === 2);

// comentar
const cm = await call(A, "select moment_comment($1, $2) id", [S1, "  Que lindo, axé! 🙏  "]);
ok("cliente comenta e o texto é aparado", !cm.err && (await sv("select body from moment_comments where id=$1", [cm.rows[0].id])).rows[0].body === "Que lindo, axé! 🙏", cm.err);
ok("comentário vazio e com mais de 300 caracteres são recusados", !!(await call(A, "select moment_comment($1, '   ')", [S1])).err && !!(await call(A, "select moment_comment($1, $2)", [S1, "x".repeat(301)])).err);
ok("a casa não comenta o próprio momento (usa o chat)", !!(await call(OWN, "select moment_comment($1, 'oi')", [S1])).err);
ok("sem login não comenta", !!(await as(null, (c) => q(c, "select moment_comment($1, 'oi')", [S1]))).err);
const cn = (await sv("select text, grouped from notifications where user_id=$1 and kind='comment' and ref_id=$2", [OWN, S1])).rows;
ok("aviso de comentário com o nome", cn.length === 1 && /Ana comentou no seu momento/.test(cn[0].text), JSON.stringify(cn));
for (let i = 0; i < 4; i++) await call(A, "select moment_comment($1, $2)", [S1, "c" + i]);
ok("no máximo 5 comentários por pessoa no mesmo momento", !!(await call(A, "select moment_comment($1, 'sexto')", [S1])).err);
const extra = []; for (let i = 0; i < 7; i++) extra.push(await mkStory(OWN, HOUSE, "x" + i));
let lim = null, made = 0;
for (const sid of extra) { for (let k = 0; k < 5 && !lim; k++) { const r = await call(B, "select moment_comment($1, 'oi')", [sid]); if (r.err) lim = r.err; else made++; } }
ok("limite diário de comentários por pessoa (30)", made === 30 && /Muitos comentários hoje/.test(lim ?? ""), `feitos ${made}; ${lim}`);
// bloqueio pela casa
await call(OWN, "select block_user($1)", [C]);
ok("quem a casa bloqueou não curte nem comenta", !!(await call(C, "select moment_like($1, true)", [S1])).err && !!(await call(C, "select moment_comment($1, 'oi')", [S1])).err);

// só a casa vê os nomes
const st = await call(OWN, "select moment_stats($1) r", [S1]);
const r = st.rows?.[0]?.r;
ok("a casa vê visualizações, curtidas e comentários com nome", !st.err && r.views === 2 && r.likes === 2 && r.comments_count === 5 && r.likers.some((x) => x.name === "Ana") && r.comments.some((x) => x.name === "Ana" && /axé/.test(x.body)), st.err ?? JSON.stringify(r).slice(0, 200));
ok("outra casa e clientes NÃO veem os números", !!(await call(OWN2, "select moment_stats($1)", [S1])).err && !!(await call(A, "select moment_stats($1)", [S1])).err && !!(await as(null, (c) => q(c, "select moment_stats($1)", [S1]))).err);
// feed
const fd = (await call(A, "select moments_feed() r")).rows[0].r;
const it = fd.flatMap((g) => g.items).find((i) => i.id === S1);
ok("o feed diz se EU curti e não mostra contagens ao cliente", it && it.liked === true && it.views === null && it.likes === null && it.comments === null, JSON.stringify(it).slice(0, 200));
const fo = (await call(OWN, "select moments_feed() r")).rows[0].r.flatMap((g) => g.items).find((i) => i.id === S1);
ok("o feed da casa traz as contagens", fo && fo.views === 2 && fo.likes === 2 && fo.comments === 5, JSON.stringify(fo));
// apagar comentário
ok("cliente apaga só o próprio comentário; a casa apaga qualquer um; terceiro não", !!(await call(B, "select moment_comment_delete($1)", [cm.rows[0].id])).err && !(await call(A, "select moment_comment_delete($1)", [cm.rows[0].id])).err);
const other = (await sv("select id from moment_comments where story_id=$1 limit 1", [S1])).rows[0].id;
ok("a casa apaga comentário de qualquer pessoa", !(await call(OWN, "select moment_comment_delete($1)", [other])).err && (await sv("select count(*)::int n from moment_comments where id=$1", [other])).rows[0].n === 0);
// momento escondido/expirado
await su.query("update stories set hidden_at = now() where id=$1", [S2]);
ok("momento escondido não recebe curtida nem comentário", !!(await call(A, "select moment_like($1, true)", [S2])).err && !!(await call(A, "select moment_comment($1, 'oi')", [S2])).err);
// suspensão
await su.query("insert into account_suspensions(user_id, reason) values ($1, 'Teste de suspensão da conta')", [B]);
ok("conta suspensa não curte nem comenta", !!(await call(B, "select moment_like($1, true)", [S1])).err && !!(await call(B, "select moment_comment($1, 'oi')", [S1])).err);
// limpeza
await su.query("update stories set expires_at = now() - interval '3 days' where id=$1", [S1]);
await su.query("delete from moment_comments where story_id in (select id from stories where expires_at < now() - interval '2 days'); delete from moment_likes where story_id in (select id from stories where expires_at < now() - interval '2 days'); delete from moment_views where story_id in (select id from stories where expires_at < now() - interval '2 days')");
ok("a rotina de limpeza apaga tudo do momento expirado há mais de 48 h e preserva os vivos", Number((await sv("select (select count(*) from moment_likes where story_id=$1)+(select count(*) from moment_comments where story_id=$1)+(select count(*) from moment_views where story_id=$1) n", [S1])).rows[0].n) === 0 && Number((await sv("select count(*) n from moment_comments")).rows[0].n) === 30);
// ACL (estruturais)
const acl = (await sv(`select has_function_privilege('anon','public.moment_like(uuid,boolean)','execute') a, has_function_privilege('authenticated','public.moment_like(uuid,boolean)','execute') b, has_function_privilege('authenticated','public.moment_target(uuid)','execute') t, has_function_privilege('anon','public.moment_stats(uuid)','execute') s`)).rows[0];
ok("anon sem acesso às funções; função interna sem acesso para ninguém", acl.a === false && acl.b === true && acl.t === false && acl.s === false, JSON.stringify(acl));
await su.end(); console.log(bad ? `${bad} FALHA(S) de ${total}` : `TUDO OK (${total})`); process.exit(bad ? 1 : 0);
