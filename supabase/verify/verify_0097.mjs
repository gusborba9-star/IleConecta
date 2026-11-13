// Verificação LOCAL da migration 0097 (aviso de mudança dos Termos e registro de leitura).
// Uso: node supabase/verify/verify_0097.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0097", { with64: true, max: 97 });
ok("migrations 0001–0097 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query(readFileSync(new URL("../migrations/0097_aviso_termos_e_leitura.sql", import.meta.url), "utf8").split("-- ============ 7) permissões ============")[1]);
const as = async (role, uid, fn) => { const c = await connect("vf0097"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const U1 = "b1000000-0000-0000-0000-0000000000b1", U2 = "b2000000-0000-0000-0000-0000000000b2", U3 = "c1000000-0000-0000-0000-0000000000c1";
for (const [u, t] of [[U1, "casa"], [U2, "cliente"], [U3, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
const TXT = "Atualizamos os Termos de Uso. Toque para ler o que mudou.";
const OUTRO = "Outro aviso diferente para todos.";
const ann = (t = TXT, h = "/termos") => sv("select public.platform_announce($1,$2) n", [t, h]);

let r = await ann(); ok("o aviso vai para todas as pessoas cadastradas (3)", !r.err && Number(r.rows[0].n) === 3, r.err);
r = await sv("select count(*) n from notifications where text=$1 and href='/termos' and read=false and read_at is null", [TXT]); ok("cada uma recebe uma notificação não lida, com o link", Number(r.rows[0].n) === 3);
r = await ann(); ok("repetir o aviso não duplica", !r.err && Number(r.rows[0].n) === 0, r.err);
await su.query("insert into profiles(id,account_type,display_name,city) select $1,'cliente','Nova','X' where false", [U1]);
r = await ann(OUTRO, null); ok("um aviso diferente chega a todos de novo (sem link)", Number(r.rows[0].n) === 3);
r = await ann("curto"); ok("texto curto demais é recusado", !!r.err && /inválido/.test(r.err), r.err);
r = await ann("x".repeat(401)); ok("texto longo demais é recusado", !!r.err, r.err);
for (const bad of ["https://golpe.com", "//golpe.com", "javascript:alert(1)", "/termos<script>"]) { r = await ann("Aviso com endereço ruim.", bad); ok(`endereço fora do padrão é recusado: ${bad}`, !!r.err && /Endereço/.test(r.err), r.err); }

// leitura registrada
r = await as("authenticated", U1, (cc) => q(cc, "update notifications set read = true where read = false and text in ($1,$2) returning read_at", [TXT, OUTRO])); ok("ao ler, o momento da leitura fica registrado", r.n === 2 && r.rows.every((x) => x.read_at), JSON.stringify(r));
r = await as("authenticated", U1, (cc) => q(cc, "select count(*) n from notifications where text in ($1,$2)", [TXT, OUTRO])); ok("a pessoa lê só as próprias notificações", r.rows?.[0]?.n === "2", JSON.stringify(r));
const t1 = (await sv("select read_at from notifications where user_id=$1 and text=$2", [U1, TXT])).rows[0].read_at;
await as("authenticated", U1, (cc) => q(cc, "update notifications set read = true"));
const t2 = (await sv("select read_at from notifications where user_id=$1 and text=$2", [U1, TXT])).rows[0].read_at;
ok("ler de novo não muda o momento da primeira leitura", String(t1) === String(t2));
r = await sv("select count(*) n from notifications where user_id=$1 and text in ($2,$3) and read_at is null", [U2, TXT, OUTRO]); ok("quem não leu continua sem leitura registrada", Number(r.rows[0].n) === 2);
await as("authenticated", U1, (cc) => q(cc, "update notifications set read = false"));
r = await sv("select count(*) n from notifications where user_id=$1 and text in ($2,$3) and read_at is not null", [U1, TXT, OUTRO]); ok("marcar como não lida limpa o registro", Number(r.rows[0].n) === 0);

// permissões
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
ok("platform_announce: só o servidor executa", !(await hasFn("anon", "public.platform_announce(text,text)")) && !(await hasFn("authenticated", "public.platform_announce(text,text)")) && (await hasFn("service_role", "public.platform_announce(text,text)")));
r = await as("authenticated", U2, (cc) => q(cc, "select public.platform_announce('Aviso falso de usuário comum.','/x')")); ok("usuário comum não envia aviso a todos", !!r.err, r.err);
r = await as("anon", null, (cc) => q(cc, "select public.platform_announce('Aviso falso de visitante.','/x')")); ok("visitante não envia aviso", !!r.err, r.err);
ok("o gatilho de leitura não é executável por visitante nem logado", !(await hasFn("anon", "public.notifications_read_at()")) && !(await hasFn("authenticated", "public.notifications_read_at()")));
r = await as("authenticated", U2, (cc) => q(cc, "update notifications set read_at = now() - interval '5 years' where user_id = auth.uid() returning read_at")); ok("a pessoa não escolhe a data de leitura (o gatilho decide)", !r.err && r.rows.every((x) => x.read_at === null), JSON.stringify(r));
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
