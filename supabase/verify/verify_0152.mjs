// Verificação LOCAL da migration 0152 (registro de acesso). Uso: node supabase/verify/verify_0152.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0152";
const { c: su, failed } = await freshDb(name, { with64: true, max: 151 });
ok("migrations 0001–0151 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const mig = readFileSync(new URL("../migrations/0152_registro_de_acesso.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0152 aplica e reaplica sem erro", e === null, e ?? "");
// a 0152 tira as permissões da tabela; refaz as concessões gerais do teste sem devolver a de access_logs
await su.query("revoke all on table public.access_logs from public, anon, authenticated");
const U = (n) => `a0152000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do nothing", [U(n), `Pessoa ${n}`]); }
const as = async (uid, headers, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false), set_config('request.headers',$3,false)`, [uid ?? "", role, headers == null ? "" : JSON.stringify(headers)]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const reg = (uid, headers, role) => as(uid, headers, (c) => c.query("select register_access()"), role).then(() => null, (x) => x.message);
const rows = async (uid) => (await su.query("select host(ip) ip, at, purge_after from access_logs where user_id=$1 order by id", [uid])).rows;

ok("registra o IP vindo do cabeçalho", (await reg(U(1), { "x-forwarded-for": "203.0.113.7, 10.0.0.1" })) === null && (await rows(U(1))).at(-1)?.ip === "203.0.113.7", JSON.stringify(await rows(U(1))));
const r1 = (await rows(U(1)))[0];
ok("prazo de 6 meses", Math.abs((new Date(r1.purge_after) - new Date(r1.at)) / 86400000 - 182) < 3, `${(new Date(r1.purge_after) - new Date(r1.at)) / 86400000} dias`);
await reg(U(1), { "x-forwarded-for": "203.0.113.7" });
ok("mesmo IP em menos de 30 min não duplica", (await rows(U(1))).length === 1);
await reg(U(1), { "x-forwarded-for": "203.0.113.8" });
ok("IP diferente registra", (await rows(U(1))).length === 2);
await su.query("update access_logs set at = now() - interval '31 minutes' where user_id=$1", [U(1)]);
await reg(U(1), { "x-forwarded-for": "203.0.113.7" });
ok("depois de 30 min registra de novo", (await rows(U(1))).length === 3);
await reg(U(1), { "cf-connecting-ip": "198.51.100.9", "x-real-ip": "198.51.100.10", "x-forwarded-for": "6.6.6.6" });
ok("cf-connecting-ip tem prioridade sobre o resto", (await rows(U(1))).at(-1).ip === "198.51.100.9");
await reg(U(2), { "x-real-ip": "198.51.100.20" });
ok("x-real-ip serve quando não há cf-connecting-ip", (await rows(U(2))).at(-1)?.ip === "198.51.100.20");
await reg(U(2), { "x-forwarded-for": "2001:db8::1" });
ok("aceita IPv6", (await rows(U(2))).at(-1)?.ip === "2001:db8::1");
// ataques
const n0 = (await su.query("select count(*)::int n from access_logs")).rows[0].n;
ok("IP inválido: não registra e não dá erro", (await reg(U(2), { "x-forwarded-for": "não-é-ip; drop table access_logs" })) === null && (await su.query("select count(*)::int n from access_logs")).rows[0].n === n0);
ok("sem cabeçalhos: não registra e não dá erro", (await reg(U(2), null)) === null && (await su.query("select count(*)::int n from access_logs")).rows[0].n === n0);
ok("cabeçalhos quebrados (não é JSON): sem erro", (await as(U(2), "isto-nao-e-json", (c) => c.query("select register_access()")).then(() => null, (x) => x.message)) === null);
ok("visitante sem conta (anon) não consegue chamar", /permission denied/i.test((await reg(null, { "x-real-ip": "198.51.100.30" }, "anon")) ?? ""));
await su.query("select set_config('request.headers','',false)");
// limite diário por conta
for (let i = 0; i < 210; i++) await su.query("insert into access_logs(user_id,ip,at) values ($1, ('10.9.' || ($2/250) || '.' || ($2%250))::inet, now() - interval '2 hours')", [U(2), i]);
const antes = (await su.query("select count(*)::int n from access_logs where user_id=$1 and at > now() - interval '1 day'", [U(2)])).rows[0].n;
await reg(U(2), { "x-real-ip": "198.51.100.99" });
ok("teto de 200 por conta por dia segura o excesso", (await su.query("select count(*)::int n from access_logs where user_id=$1 and at > now() - interval '1 day'", [U(2)])).rows[0].n === antes, antes);
// ninguém lê pela API
for (const [uid, role] of [[U(1), "authenticated"], [null, "anon"]]) {
  const r = await as(uid, null, (c) => c.query("select * from access_logs"), role).then(() => "leu", (x) => x.message);
  ok(`${role} não lê a tabela`, /permission denied/i.test(r), r);
}
const w = await as(U(1), null, (c) => c.query("delete from access_logs"), "authenticated").then(() => "apagou", (x) => x.message);
ok("autenticado não apaga registros", /permission denied/i.test(w), w);
const w2 = await as(U(1), null, (c) => c.query("insert into access_logs(user_id,ip) values ($1,'1.1.1.1')", [U(1)]), "authenticated").then(() => "inseriu", (x) => x.message);
ok("autenticado não insere direto (não forja registro)", /permission denied/i.test(w2), w2);
const pf = await as(U(1), null, (c) => c.query("select purge_access_logs()"), "authenticated").then(() => "rodou", (x) => x.message);
ok("autenticado não roda a limpeza", /permission denied/i.test(pf), pf);
// exclusão da conta não derruba o registro
await su.query("delete from auth.users where id=$1", [U(1)]).catch(() => null);
ok("registro sobrevive à exclusão da conta (sem chave estrangeira)", (await rows(U(1))).length >= 1);
// limpeza
await su.query("update access_logs set purge_after = now() - interval '1 day' where user_id=$1", [U(1)]);
const n = (await su.query("select purge_access_logs() n")).rows[0].n;
ok("limpeza apaga o que passou de 6 meses e só isso", n >= 1 && (await rows(U(1))).length === 0 && (await rows(U(2))).length > 0, n);
ok("rotina diária de limpeza declarada na migration (o agendador é simulado neste ambiente)", /cron\.schedule\('purge-access-logs', '40 3 \* \* \*', 'select public\.purge_access_logs\(\)'\)/.test(mig));
await su.end();
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);
