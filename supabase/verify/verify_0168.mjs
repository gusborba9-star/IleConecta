// Verificação LOCAL da migration 0168 (identificação do operador). Uso: node supabase/verify/verify_0168.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 300) : ""}`); if (!c) bad++; };
const name = "vf0168";
const { c: su, failed } = await freshDb(name, { with64: true, max: 167 });
ok("migrations 0001–0167 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0168_identificacao_do_operador.sql", import.meta.url), "utf8");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const uuid = (i) => `d0168000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const mk = async (id, nm, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2)", [id, `u${id.slice(-2)}@x.com`]); await su.query("insert into profiles(id,account_type,display_name) values ($1,$3,$2) on conflict (id) do update set account_type=excluded.account_type, display_name=excluded.display_name", [id, nm, type]); };
const BOSS = uuid(1), MOD = uuid(2), CLI = uuid(4);
await mk(BOSS, "Dono Plataforma"); await mk(MOD, "Moderadora"); await mk(CLI, "Cliente");
await su.query("insert into admins(user_id, is_owner) values ($1, true)", [BOSS]);
await su.query("insert into admins(user_id, perms) values ($1, array['moderacao'])", [MOD]);

let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0168 aplica e reaplica sem erro", e === null, e ?? "");
ok("dado inicial: uma linha, CPF mascarado", (await sv("select count(*)::int n, min(name) nm, min(document) d from operator_identity")).rows.every((r) => r.n === 1 && r.nm === "Gustavo dos Santos Borba" && r.d === "***.116.210-**"));
ok("reaplicar não duplica nem sobrescreve a linha", (await sv("select count(*)::int n from operator_identity")).rows[0].n === 1);

const pub = (uid) => as(uid, (c) => q(c, "select operator_identity_public() d"), uid ? "authenticated" : "anon");
const p1 = await pub(null); ok("anônimo lê a identificação pública", !p1.err && p1.rows[0].d.name === "Gustavo dos Santos Borba" && p1.rows[0].d.document === "***.116.210-**", p1.err);
ok("leitura pública devolve só nome, documento, endereço e e-mail", JSON.stringify(Object.keys(p1.rows[0].d).sort()) === JSON.stringify(["address", "document", "email", "name"]));
for (const t of ["operator_identity", "operator_identity_log"]) {
  ok(`tabela ${t} fechada para anônimo e logado`, !!(await as(null, (c) => q(c, `select * from ${t}`), "anon")).err && !!(await as(CLI, (c) => q(c, `select * from ${t}`))).err);
  ok(`${t} não aceita escrita direta`, !!(await as(BOSS, (c) => q(c, `delete from ${t}`))).err);
}

const set = (uid, ...a) => as(uid, (c) => q(c, "select admin_operator_set($1,$2,$3,$4,$5) d", a));
const OKARGS = ["Gustavo dos Santos Borba", "***.116.210-**", null, "contato@ileconecta.com.br", true];
for (const [who, uid] of [["cliente", CLI], ["equipe sem 'dono'", MOD], ["anônimo", null]]) {
  const r = uid ? await set(uid, ...OKARGS) : await as(null, (c) => q(c, "select admin_operator_set($1,$2,$3,$4,$5)", OKARGS), "anon");
  ok(`${who} NÃO altera a identificação`, !!r.err && /not_admin|permission/.test(r.err), r.err);
  ok(`${who} NÃO lê o histórico`, !!(uid ? await as(uid, (c) => q(c, "select admin_operator_log()")) : await as(null, (c) => q(c, "select admin_operator_log()"), "anon")).err);
}
ok("CPF completo é recusado", /CPF completo/.test((await set(BOSS, "Gustavo dos Santos Borba", "123.116.210-45", null, null, false)).err ?? ""));
ok("CPF só com números é recusado", !!(await set(BOSS, "Gustavo dos Santos Borba", "12311621045", null, null, false)).err);
ok("documento com texto extra é recusado", !!(await set(BOSS, "Gustavo dos Santos Borba", "***.116.210-**; drop table x", null, null, false)).err && !!(await set(BOSS, "Gustavo dos Santos Borba", "x***.116.210-**", null, null, false)).err);
ok("nome com HTML ou curto demais é recusado", !!(await set(BOSS, "<b>Gu</b>", "***.116.210-**", null, null, false)).err && !!(await set(BOSS, "Gu", "***.116.210-**", null, null, false)).err);
ok("e-mail inválido é recusado", !!(await set(BOSS, "Gustavo dos Santos Borba", "***.116.210-**", null, "sem arroba", false)).err && !!(await set(BOSS, "Gustavo dos Santos Borba", "***.116.210-**", null, "a@b", false)).err);
ok("endereço com HTML é recusado", !!(await set(BOSS, "Gustavo dos Santos Borba", "***.116.210-**", "Rua <script>", null, false)).err);
ok("sem mudança nenhuma é recusado ('Nada mudou')", /Nada mudou/.test((await set(BOSS, "Gustavo dos Santos Borba", "***.116.210-**", null, null, false)).err ?? ""));
ok("nada disso mexeu nos dados nem no histórico", (await sv("select (select count(*)::int from operator_identity_log) l, (select contact_email from operator_identity) m")).rows.every((r) => r.l === 0 && r.m === null));

// ---- mudança válida: e-mail novo, com aviso a todos
const antes = (await sv("select count(*)::int n from notifications")).rows[0].n;
const g = await set(BOSS, "  Gustavo   dos Santos Borba ", "***.116.210-**", null, "Contato@IleConecta.com.br", true);
ok("dono grava o e-mail (minúsculo, espaços ajustados) e avisa", !g.err && g.rows[0].d.ok === true && g.rows[0].d.notified === 3, g.err ?? JSON.stringify(g.rows[0]?.d));
ok("dados gravados corretamente", (await sv("select name, contact_email, updated_by from operator_identity")).rows.every((r) => r.name === "Gustavo dos Santos Borba" && r.contact_email === "contato@ileconecta.com.br" && r.updated_by === BOSS));
ok("uma notificação por conta, com link para os Termos", (await sv("select count(*)::int n, count(distinct user_id)::int u, min(href) h from notifications where text like 'Em % atualizamos a identificação de quem opera%'")).rows.every((r) => r.n === 3 && r.u === 3 && r.h === "/termos"));
ok("histórico guarda quem mudou e o novo conteúdo", (await as(BOSS, (c) => q(c, "select admin_operator_log() d"))).rows[0].d.some((l) => l.by === "Dono Plataforma" && l.email === "contato@ileconecta.com.br"));
// ---- trocar para CNPJ sem avisar (p_notify false) e conferir a leitura pública
const c2 = await set(BOSS, "Ilê Conecta Ltda", "12.345.678/0001-95", "Rua das Flores, 100, Salvador/BA", "contato@ileconecta.com.br", false);
ok("troca para CNPJ completo sem aviso", !c2.err && c2.rows[0].d.notified === 0, c2.err);
ok("leitura pública já mostra a razão social e o CNPJ", (await pub(CLI)).rows[0].d.name === "Ilê Conecta Ltda" && (await pub(CLI)).rows[0].d.document === "12.345.678/0001-95");
ok("histórico tem as duas mudanças, a mais nova primeiro", (await as(BOSS, (c) => q(c, "select admin_operator_log() d"))).rows[0].d.map((l) => l.name).join("|") === "Ilê Conecta Ltda|Gustavo dos Santos Borba");
ok("limpar endereço e e-mail (vazios) é aceito", !(await set(BOSS, "Ilê Conecta Ltda", "12.345.678/0001-95", "  ", "", false)).err && (await pub(null)).rows[0].d.address === null);
console.log(`\n${total - bad}/${total} OK`); await su.end(); process.exit(bad ? 1 : 0);
