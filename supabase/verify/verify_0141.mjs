// Verificação LOCAL da migration 0141 (avisos de curtida, comentário e novo seguidor). Uso: node supabase/verify/verify_0141.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0141";
const { c: su, failed } = await freshDb(name, { with64: true, max: 140 });
ok("migrations 0001–0140 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0141_avisos_de_curtida_comentario_seguidor.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0141 aplica e reaplica sem erro", e === null, e ?? "");
// a migration revoga tudo de authenticated nas tabelas novas/funções: refaz o grant só do que já existia para o teste espelhar produção
await su.query(`grant select, insert, update, delete on all tables in schema public to authenticated, service_role; revoke all on public.social_notice_log from public, anon, authenticated;`);

const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (x) => ({ err: x.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `e0141000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, t = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$2,$3) on conflict (id) do update set display_name=excluded.display_name", [id, t, nm]); };
const OWN = uuid(1), HOUSE = uuid(11), OWN2 = uuid(2), HOUSE2 = uuid(12), A = uuid(21), B = uuid(22), C = uuid(23), D = uuid(24), SUSP = uuid(25);
await mk(OWN, "Casa Axé", "casa"); await mk(OWN2, "Outra Casa", "casa");
for (const [id, n] of [[A, "Ana"], [B, "Beto"], [C, "Carla"], [D, "Davi"], [SUSP, "Suspenso"]]) await mk(id, n);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Axé','casa-axe','gratis'),($3,$4,'Outra Casa','outra-casa','gratis')", [HOUSE, OWN, HOUSE2, OWN2]);
const post = async (h) => (await sv("insert into posts(house_id,kind,content) values ($1,'geral','Axé!') returning id", [h])).rows[0].id;
const P1 = await post(HOUSE), P2 = await post(HOUSE), P3 = await post(HOUSE2);
const like = (uid, p) => as(uid, (c) => q(c, "insert into post_likes(post_id,user_id) values ($1,$2)", [p, uid]));
const unlike = (uid, p) => as(uid, (c) => q(c, "delete from post_likes where post_id=$1 and user_id=$2", [p, uid]));
const comment = (uid, p, t = "Lindo!") => as(uid, (c) => q(c, "insert into post_comments(post_id,user_id,text) values ($1,$2,$3)", [p, uid, t]));
const follow = (uid, owner) => as(uid, (c) => q(c, "select follow_house($1)", [owner]));
const unfollow = (uid, owner) => as(uid, (c) => q(c, "select unfollow_house($1)", [owner]));
const notes = async (uid, kind) => (await sv("select * from notifications where user_id=$1 and kind=$2 order by created_at", [uid, kind])).rows;
const reset = async () => { await su.query("delete from notifications"); await su.query("delete from social_notice_log"); await su.query("delete from post_likes"); await su.query("delete from post_comments"); await su.query("delete from follows"); await su.query("delete from notification_prefs"); await su.query("delete from account_suspensions"); };

// ---- curtidas
let r = await like(A, P1); ok("curtida: a casa recebe o aviso certo", !r.err, r.err);
let n = await notes(OWN, "like");
ok("aviso da curtida: texto, link para a publicação, quem e quantos", n.length === 1 && n[0].text === "Ana curtiu sua publicação." && n[0].href === `/comunidade?post=${P1}` && n[0].ref_id === P1 && n[0].actor_id === A && n[0].grouped === 1 && n[0].read === false, JSON.stringify(n[0]));
await like(B, P1); n = await notes(OWN, "like");
ok("2ª curtida agrupa na mesma linha", n.length === 1 && n[0].grouped === 2 && n[0].text === "Beto e mais 1 pessoa curtiram sua publicação.", JSON.stringify(n.map((x) => x.text)));
await like(C, P1); n = await notes(OWN, "like");
ok("3ª curtida: 'e mais 2 pessoas'", n.length === 1 && n[0].grouped === 3 && n[0].text === "Carla e mais 2 pessoas curtiram sua publicação.", n[0]?.text);
await unlike(A, P1); await like(A, P1); n = await notes(OWN, "like");
ok("descurtir e curtir de novo NÃO repete o aviso", n.length === 1 && n[0].grouped === 3);
await like(D, P2); n = await notes(OWN, "like");
ok("outra publicação tem o próprio aviso", n.length === 2 && n.some((x) => x.ref_id === P2 && x.grouped === 1));
await su.query("update notifications set read=true where user_id=$1", [OWN]); await unlike(D, P1); await like(D, P1); n = await notes(OWN, "like");
ok("depois de lido, curtida nova de quem ainda não tinha avisado abre aviso novo", n.filter((x) => !x.read).length === 1 && n.filter((x) => !x.read)[0].grouped === 1 && n.filter((x) => !x.read)[0].ref_id === P1, JSON.stringify(n.map((x) => [x.read, x.grouped])));
await reset();
await like(OWN, P1); ok("a casa curtindo a própria publicação não gera aviso", (await notes(OWN, "like")).length === 0);
await like(A, P3); ok("curtida em publicação de outra casa avisa só a dona dela", (await notes(OWN2, "like")).length === 1 && (await notes(OWN, "like")).length === 0);
await reset();
// corrida: duas curtidas ao mesmo tempo
const [r1, r2, r3] = await Promise.all([like(A, P1), like(B, P1), like(C, P1)]);
n = await notes(OWN, "like");
ok("3 curtidas simultâneas: sem erro e UM aviso com 3", !r1.err && !r2.err && !r3.err && n.length === 1 && n[0].grouped === 3, JSON.stringify([r1.err, r2.err, r3.err, n.map((x) => x.grouped)]));
await reset();

// ---- comentários
await comment(A, P1); n = await notes(OWN, "comment");
ok("comentário: aviso com link para a publicação", n.length === 1 && n[0].text === "Ana comentou na sua publicação." && n[0].href === `/comunidade?post=${P1}` && n[0].grouped === 1, JSON.stringify(n[0]));
ok("o aviso não carrega o texto do comentário (sem exposição)", !/Lindo/.test(n[0].text));
await comment(A, P1); await comment(A, P1); n = await notes(OWN, "comment");
ok("mesma pessoa comentando de novo agrupa: 'comentou 3 vezes'", n.length === 1 && n[0].grouped === 3 && n[0].text === "Ana comentou 3 vezes na sua publicação.", n[0]?.text);
await comment(B, P1); n = await notes(OWN, "comment");
ok("outra pessoa tem o próprio aviso", n.length === 2);
await comment(OWN, P1, "Obrigada!"); ok("a casa comentando na própria publicação não gera aviso", (await notes(OWN, "comment")).length === 2);
await su.query("update notifications set read=true where user_id=$1", [OWN]); await comment(A, P1); n = await notes(OWN, "comment");
ok("depois de lido, comentário novo abre aviso novo", n.filter((x) => !x.read).length === 1 && n.filter((x) => !x.read)[0].grouped === 1);
await reset();

// ---- seguidores
r = await follow(A, OWN); n = await notes(OWN, "follow");
ok("seguir: aviso para a casa", !r.err && n.length === 1 && n[0].text === "Ana começou a seguir você." && n[0].href === "/pessoas" && n[0].ref_id === HOUSE && n[0].actor_id === A, JSON.stringify(n[0]));
await unfollow(A, OWN); await follow(A, OWN); ok("deixar de seguir e seguir de novo NÃO repete o aviso", (await notes(OWN, "follow")).length === 1);
await follow(B, OWN); ok("outra pessoa seguindo gera aviso próprio", (await notes(OWN, "follow")).length === 2);
r = await follow(OWN, OWN); ok("a casa não segue a si mesma (e não avisa)", /própria casa/.test(r.err ?? "") && (await notes(OWN, "follow")).length === 2, r.err);
await follow(A, OWN2); ok("seguir outra casa avisa só ela", (await notes(OWN2, "follow")).length === 1 && (await notes(OWN, "follow")).length === 2);
await reset();

// ---- preferências por tipo
const pref = (col, v) => su.query(`insert into notification_prefs(user_id, ${col}) values ($1,$2) on conflict (user_id) do update set ${col}=excluded.${col}`, [OWN, v]);
await pref("notify_likes", false); await like(A, P1); ok("preferência desligada: curtidas não avisam", (await notes(OWN, "like")).length === 0);
await comment(A, P1); await follow(A, OWN); ok("…mas comentário e seguidor continuam avisando", (await notes(OWN, "comment")).length === 1 && (await notes(OWN, "follow")).length === 1);
await reset(); await pref("notify_comments", false); await comment(A, P1); ok("preferência desligada: comentários não avisam", (await notes(OWN, "comment")).length === 0);
await reset(); await pref("notify_follows", false); await follow(A, OWN); ok("preferência desligada: seguidores não avisam", (await notes(OWN, "follow")).length === 0);
await reset(); await pref("notify_likes", true); await like(A, P1); ok("religando volta a avisar", (await notes(OWN, "like")).length === 1);
await reset();
const prefDefault = await sv("select column_name, column_default from information_schema.columns where table_name='notification_prefs' and column_name like 'notify_%' order by 1");
ok("padrão das 3 preferências é ligado", prefDefault.rows.length === 3 && prefDefault.rows.every((x) => x.column_default === "true"));

// ---- abuso e segurança
await su.query("insert into account_suspensions(user_id, reason) values ($1,'motivo de teste suficiente')", [SUSP]);
await su.query("delete from notifications");
const rs = await q(su, "insert into post_likes(post_id,user_id) values ($1,$2)", [P1, SUSP]);
ok("curtida de conta suspensa não gera aviso", !rs.err && (await notes(OWN, "like")).length === 0, rs.err);
await reset();
// o aviso nunca atrapalha a ação: com a tabela de avisos quebrada, curtir/comentar/seguir ainda funcionam
await su.query("alter table notifications add constraint boom check (false) not valid");
const [b1, b2, b3] = [await like(A, P1), await comment(A, P1), await follow(A, OWN)];
ok("aviso falhando NÃO desfaz curtida, comentário nem seguir", !b1.err && !b2.err && !b3.err && (await sv("select (select count(*) from post_likes)::int l, (select count(*) from post_comments)::int c, (select count(*) from follows)::int f")).rows.every((x) => x.l === 1 && x.c === 1 && x.f === 1), [b1.err, b2.err, b3.err].join("|"));
await su.query("alter table notifications drop constraint boom"); await reset();
// ninguém forja aviso, lê ou altera os dos outros
const forged = await as(A, (c) => q(c, "insert into notifications(user_id,text,kind) values ($1,'Aviso falso','like')", [OWN]));
ok("cliente não consegue criar aviso para a casa", !!forged.err, forged.err);
await like(A, P1);
const peek = await as(B, (c) => q(c, "select count(*)::int n from notifications where user_id=$1", [OWN]));
ok("outra pessoa não lê os avisos da casa", peek.rows?.[0]?.n === 0, JSON.stringify(peek));
const tamper = await as(B, (c) => q(c, "update notifications set read=true, text='x' where user_id=$1", [OWN]));
ok("outra pessoa não altera os avisos da casa", (tamper.n ?? 0) === 0, JSON.stringify(tamper));
const own = await as(OWN, (c) => q(c, "select count(*)::int n from notifications where kind='like'"));
ok("a casa lê os próprios avisos", own.rows?.[0]?.n === 1);
const log = await as(A, (c) => q(c, "select * from social_notice_log"));
ok("registro interno inacessível para quem usa o app", !!log.err, log.err);
const bk = await q(su, "insert into notifications(user_id,text,kind) values ($1,'x','invalido')", [OWN]);
ok("tipo de aviso inválido é recusado pelo banco", !!bk.err, bk.err);
const grp = await q(su, "insert into notifications(user_id,text,kind,ref_id,grouped) values ($1,'x','like',$2,0)", [OWN, P2]);
ok("contagem do grupo fora da faixa é recusada", !!grp.err, grp.err);
const acl = await sv(`select bool_or(has_function_privilege(r,f,'execute')) any_exec from unnest(array['anon','authenticated']) r, unnest(array['public.notify_post_like()','public.notify_post_comment()','public.notify_new_follower()','public.social_actor_name(uuid)','public.social_like_text(text,integer)']) f`);
ok("ACL: ninguém do app executa os gatilhos nem os auxiliares", acl.rows[0].any_exec === false, JSON.stringify(acl.rows));
const meta = await sv("select proname, prosecdef, proconfig from pg_proc where proname in ('notify_post_like','notify_post_comment','notify_new_follower','social_actor_name')");
ok("security definer com search_path fixo", meta.rows.length === 4 && meta.rows.every((x) => x.prosecdef && /search_path=public/.test(String(x.proconfig))));
// nome hostil não quebra nem vaza para fora do texto; o banco já limita o tamanho do nome (profiles_display_name_check)
await su.query("update profiles set display_name=$1 where id=$2", ["<script>alert(1)</script>", D]); await reset();
await like(D, P1); n = await notes(OWN, "like");
ok("nome hostil vira texto puro no aviso (o front só mostra como texto)", n.length === 1 && n[0].text === "<script>alert(1)</script> curtiu sua publicação.", n[0]?.text);
ok("sem perfil/nome o aviso usa 'Alguém'", (await sv("select coalesce(public.social_actor_name($1), 'Alguém') n", [uuid(99)])).rows[0].n === "Alguém");
await reset();

// ---- mutação: sem os gatilhos nada avisa (prova que os testes enxergam o defeito)
await su.query("drop trigger trg_notify_post_like on post_likes");
await like(A, P1); ok("MUTAÇÃO: sem o gatilho de curtida, nenhum aviso (o teste detectaria a falta)", (await notes(OWN, "like")).length === 0);
await su.query(mig); await reset();
await like(A, P1); ok("reaplicar a migration restaura o gatilho", (await notes(OWN, "like")).length === 1);
// push continua só por INSERT: a curtida agrupada (UPDATE) não dispara outro push
const trg = await sv("select tgname from pg_trigger where tgrelid='public.notifications'::regclass and not tgisinternal and tgname like '%push%'");
ok("envio ao celular continua amarrado só à criação do aviso", trg.rows.length === 1 && /AFTER INSERT/i.test((await sv("select pg_get_triggerdef(oid) d from pg_trigger where tgname=$1", [trg.rows[0].tgname])).rows[0].d));
console.log(`\n${total - bad}/${total} ok`);
await su.end?.(); process.exit(bad ? 1 : 0);
