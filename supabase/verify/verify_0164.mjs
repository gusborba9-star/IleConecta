// Verificação LOCAL da migration 0164 (limite diário de momentos conta o publicado). Uso: node supabase/verify/verify_0164.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0164";
const { c: su, failed } = await freshDb(name, { with64: true, max: 163 });
ok("migrations 0001–0163 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0164_momentos_limite_conta_publicados.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid ?? ""]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0164000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm, type]); };
const OWN = uuid(1), OWN2 = uuid(2), H1 = uuid(11), H2 = uuid(12), CLI = uuid(21);
await mk(OWN, "Casa Um", "casa"); await mk(OWN2, "Casa Dois", "casa"); await mk(CLI, "Cliente");
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','base'), ($3,$4,'Casa Dois','casa-dois','base')", [H1, OWN, H2, OWN2]);
const put = (owner, f) => su.query("insert into storage.objects(bucket_id,name,owner) values ('moments',$1,$2) on conflict do nothing", [`${owner}/${f}`, owner]);
const pub = async (owner, house, tag) => { await put(owner, tag + ".jpg"); return as(owner, (c) => q(c, "insert into stories(house_id,media_path) values ($1,$2) returning id", [house, `${owner}/${tag}.jpg`])); };
// antes da 0164: uma casa com 2 momentos de hoje (um deles com mais de 24 h não entra)
const old1 = await pub(OWN, H1, "pre1"); const old2 = await pub(OWN, H1, "pre2");
await su.query("update stories set created_at = now() - interval '30 hours', expires_at = now() - interval '6 hours' where id=$1", [old1.rows[0].id]);
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0164 aplica e reaplica sem erro", e === null, e ?? "");
ok("o que já estava publicado nas últimas 24 h entrou no registro (uma vez só, mesmo reaplicando)", (await sv("select count(*)::int n from moment_publish_log where house_id=$1", [H1])).rows[0].n === 1);
// limite 3 (Essencial): já tem 1 hoje
const a = await pub(OWN, H1, "a"), b = await pub(OWN, H1, "b");
ok("publica até o limite (3 no total do dia)", !a.err && !b.err, a.err ?? b.err);
const c4 = await pub(OWN, H1, "c");
ok("o 4º é recusado", !!c4.err && /limite de 3/.test(c4.err), c4.err);
const del = await as(OWN, (c) => q(c, "delete from stories where id=$1", [a.rows[0].id]));
ok("a casa consegue apagar o próprio momento", !del.err && del.n === 1, del.err);
const c5 = await pub(OWN, H1, "d");
ok("apagar NÃO devolve a vaga: continua recusado", !!c5.err && /limite de 3/.test(c5.err), c5.err);
await as(OWN, (c) => q(c, "delete from stories where id=$1", [b.rows[0].id])); await as(OWN, (c) => q(c, "delete from stories where id=$1", [old2.rows[0].id]));
const c6 = await pub(OWN, H1, "e");
ok("apagar todos também não devolve", !!c6.err);
ok("a outra casa não é afetada", !(await pub(OWN2, H2, "z")).err);
// janela de 24 h
await su.query("update moment_publish_log set created_at = now() - interval '25 hours' where house_id=$1", [H1]);
ok("passadas 24 h a vaga volta", !(await pub(OWN, H1, "f")).err);
// função de contagem
const cnt = await as(OWN, (c) => q(c, "select moments_published_today($1) n", [H1]));
ok("a casa vê quantos publicou hoje", !cnt.err && cnt.rows[0].n === 1, cnt.err ?? JSON.stringify(cnt.rows));
ok("outra casa, cliente e anônimo não consultam", !!(await as(OWN2, (c) => q(c, "select moments_published_today($1)", [H1]))).err && !!(await as(CLI, (c) => q(c, "select moments_published_today($1)", [H1]))).err && !!(await as(null, (c) => q(c, "select moments_published_today($1)", [H1]))).err);
// momento recusado por outra regra não gasta vaga
const before = (await sv("select count(*)::int n from moment_publish_log where house_id=$1", [H2])).rows[0].n;
await as(OWN2, (c) => q(c, "insert into stories(house_id,media_path) values ($1,'x/y.jpg')", [H2]));
ok("publicação recusada (arquivo inválido) não consome vaga", (await sv("select count(*)::int n from moment_publish_log where house_id=$1", [H2])).rows[0].n === before);
const acl = (await sv("select has_function_privilege('anon','public.moments_published_today(uuid)','execute') a, has_function_privilege('authenticated','public.moments_published_today(uuid)','execute') b")).rows[0];
ok("anon sem acesso; logada com acesso", acl.a === false && acl.b === true);
await su.end(); console.log(bad ? `${bad} FALHA(S) de ${total}` : `TUDO OK (${total})`); process.exit(bad ? 1 : 0);
