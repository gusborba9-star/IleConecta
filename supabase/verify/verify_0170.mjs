// Verificação LOCAL da migration 0170 (Momentos: proteção de menores e aviso à casa). Uso: node supabase/verify/verify_0170.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 400) : ""}`); if (!c) bad++; };
const name = "vf0170";
const { c: su, failed } = await freshDb(name, { with64: true, max: 169 });
ok("migrations 0001–0169 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(`grant usage on schema storage to anon, authenticated, service_role; grant select, insert, update, delete on storage.objects to authenticated, service_role; alter table storage.objects enable row level security;`);
const mig = readFileSync(new URL("../migrations/0170_momentos_protecao_de_menores.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0170000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set display_name=excluded.display_name", [id, nm, type]); };
const OWN = uuid(1), HOUSE = uuid(11), A = uuid(21), B = uuid(22), C = uuid(23), D = uuid(24), ADM = uuid(31), SUP = uuid(32);
await mk(OWN, "Casa Um", "casa"); for (const [i, n] of [[A, "Ana"], [B, "Beto"], [C, "Carla"], [D, "Dani"], [ADM, "Moderador"], [SUP, "Suporte"]]) await mk(i, n);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa Um','casa-um','maximo')", [HOUSE, OWN]);
await su.query("insert into admins(user_id, perms) values ($1, array['moderacao']), ($2, array['suporte'])", [ADM, SUP]);
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0170 aplica e reaplica sem erro", e === null, e ?? "");
const put = (owner, file) => su.query("insert into storage.objects(bucket_id,name,owner) values ('moments',$1,$2) on conflict do nothing", [`${owner}/${file}`, owner]);
const mkStory = async (tag) => { await put(OWN, tag + ".jpg"); return (await su.query("insert into stories(house_id,media_path) values ($1,$2) returning id", [HOUSE, `${OWN}/${tag}.jpg`])).rows[0].id; };
const rep = (uid, id, r) => as(uid, (c) => q(c, "select report_moment($1,$2) r", [id, r]));
const dec = (uid, id, a, n) => as(uid, (c) => q(c, "select admin_moment_decide($1,$2,$3) r", [id, a, n ?? null]));
const notes = async () => (await sv("select user_id, text, href from notifications order by created_at, id")).rows;
const hidden = async (id) => (await sv("select hidden_at is not null h, expires_at > now() live from stories where id=$1", [id])).rows[0];

// ---- motivo novo
const S1 = await mkStory("s1");
ok("motivo inválido continua recusado", !!(await rep(A, S1, "bobagem")).err && !!(await rep(A, S1, null)).err);
ok("a própria casa não denuncia o próprio momento", !!(await rep(OWN, S1, "menor")).err);
ok("denúncia comum (1) não oculta e não avisa a casa", !(await rep(A, S1, "golpe")).err && (await hidden(S1)).h === false && (await notes()).length === 0);
const r1 = await rep(B, S1, "menor");
ok("denúncia 'menor' oculta na hora, mesmo sendo a segunda pessoa", !r1.err && (await hidden(S1)).h === true, r1.err);
let n = await notes();
ok("a casa recebe UM aviso de ocultação preventiva, com link para os Termos da Casa", n.length === 1 && n[0].user_id === OWN && /Ocultamos por precaução/.test(n[0].text) && n[0].href === "/sobre/termos-da-casa", JSON.stringify(n));
await rep(C, S1, "menor");
ok("outra denúncia 'menor' no mesmo momento já oculto não repete o aviso", (await notes()).length === 1);
ok("ninguém além da casa recebe aviso", (await sv("select count(*)::int n from notifications where user_id <> $1", [OWN])).rows[0].n === 0);
ok("momento oculto some do carrossel dos clientes", !(JSON.stringify((await as(D, (c) => q(c, "select moments_feed() d"))).rows[0]?.d ?? []).includes(S1)));

// ---- decisão: remover (com menor)
ok("cliente, equipe sem moderação e anônimo NÃO decidem", !!(await dec(D, S1, "remover")).err && !!(await dec(SUP, S1, "remover")).err && !!(await as(null, (c) => q(c, "select admin_moment_decide($1,'remover')", [S1]), "anon")).err);
ok("nada mudou nas tentativas recusadas", (await notes()).length === 1);
const d1 = await dec(ADM, S1, "remover", "menor sem autorização");
ok("moderação remove", !d1.err && (await hidden(S1)).live === false, d1.err);
n = await notes();
ok("a casa recebe o aviso de remoção por proteção de menores", n.length === 2 && /proteção a crianças e adolescentes/.test(n[1].text) && /autorização expressa dos pais ou responsáveis/.test(n[1].text) && n[1].href === "/sobre/termos-da-casa", JSON.stringify(n[1]));

// ---- remover sem menor; manter oculto; manter nunca ocultado
const S2 = await mkStory("s2");
for (const u of [A, B, C]) await rep(u, S2, "assedio");
ok("3 denúncias comuns ocultam (regra antiga) sem avisar a casa", (await hidden(S2)).h === true && (await notes()).length === 2);
await dec(ADM, S2, "manter");
n = await notes();
ok("manter um momento que estava oculto: volta ao ar e a casa é avisada", (await hidden(S2)).h === false && n.length === 3 && /voltou ao ar/.test(n[2].text) && n[2].href === "/suporte", JSON.stringify(n[2]));
const S3 = await mkStory("s3");
await rep(A, S3, "golpe"); await dec(ADM, S3, "manter");
ok("manter um momento que nunca foi ocultado não avisa ninguém", (await notes()).length === 3);
const S4 = await mkStory("s4");
await rep(A, S4, "outro"); await dec(ADM, S4, "remover");
n = await notes();
ok("remover sem denúncia de menor: aviso comum, sem falar de menores", n.length === 4 && /retirado pela moderação após uma denúncia/.test(n[3].text) && !/crianças/.test(n[3].text), JSON.stringify(n[3]));
ok("decidir de novo, sem denúncia aberta, é recusado e não avisa", !!(await dec(ADM, S4, "remover")).err && (await notes()).length === 4);
ok("fila da moderação mostra o motivo 'menor'", (await sv("select count(*)::int n from moment_reports where reason='menor'")).rows[0].n === 2);
ok("função interna de aviso não é chamável por usuário", !!(await as(ADM, (c) => q(c, "select moment_notify_house($1,'removido')", [HOUSE]))).err && !!(await as(OWN, (c) => q(c, "select moment_notify_house($1,'removido')", [HOUSE]))).err);
ok("aviso desconhecido é recusado (por quem pode chamar)", !!(await sv("select moment_notify_house($1,'qualquer')", [HOUSE])).err);
console.log(`\n${total - bad}/${total} OK`); await su.end(); process.exit(bad ? 1 : 0);
