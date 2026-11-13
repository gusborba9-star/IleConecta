// Verificação LOCAL da migration 0092 (textos dos planos sem "Lara" + foto da assistente).
// Uso: node supabase/verify/verify_0092.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0092", { with64: true, max: 92 });
ok("migrations 0001–0092 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
await su.query(part("0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"));
await su.query(part("0092_planos_e_foto_da_assistente.sql", "-- ============ 3) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0092"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2", CLI = "c1000000-0000-0000-0000-0000000000c1";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2";
for (const [u, t] of [[OWN_A, "casa"], [OWN_B, "casa"], [CLI, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','intermediario'), ($3,$4,'Casa B','casa-b','base')", [HA, OWN_A, HB, OWN_B]);

// ---------- 1) textos dos planos ----------
let r = await sv("select public.plan_matrix_default()::text like '%Lara%' lara, public.plan_matrix_ok(public.plan_matrix_default()) valido, public.plan_matrix_default()::text like '%A assistente da casa atende 24h%' texto1, public.plan_matrix_default()::text like '%A assistente com até%' texto2");
ok("matriz padrão: sem 'Lara', válida e com os textos novos", r.rows[0].lara === false && r.rows[0].valido === true && r.rows[0].texto1 && r.rows[0].texto2, JSON.stringify(r.rows[0]));
r = await sv("select value::text like '%Lara%' lara, public.plan_matrix_ok(value) valido from platform_settings where key='plan_matrix'");
ok("matriz salva (que veio da 0085 com 'Lara') foi corrigida e continua válida", r.rows[0].lara === false && r.rows[0].valido === true, JSON.stringify(r.rows[0]));
// texto editado pelo proprietário não é sobrescrito: reaplica o trecho de atualização da migration sobre um valor customizado
const upd = readFileSync(new URL("../migrations/0092_planos_e_foto_da_assistente.sql", import.meta.url), "utf8").split("-- ============ 1) textos dos planos sem o nome de teste ============")[1].split("-- ============ 2) foto da assistente ============")[0].split("update public.platform_settings")[1];
await sv(`update platform_settings set value = replace(value::text, 'A assistente da casa atende 24h', 'Lara Especial atende 24h')::jsonb where key='plan_matrix'`);
await sv("update public.platform_settings" + upd);
r = await sv("select value::text like '%Lara Especial atende 24h%' kept from platform_settings where key='plan_matrix'");
ok("texto editado pelo proprietário (outra frase com 'Lara') não é sobrescrito", r.rows[0].kept === true);
await sv("update public.platform_settings" + upd); r = await sv("select count(*) n from platform_settings where key='plan_matrix'"); ok("reaplicar é seguro", r.rows[0].n === "1");
r = await sv("select public.plan_matrix()::text like '%Lara%' lara"); ok("a leitura pública da matriz segue funcionando", r.rows[0].lara !== undefined && !r.err);

// ---------- 2) foto: regras do banco ----------
const good = (o, n = 1731400000) => `${o}/assistant-${n}.webp`;
r = await sv("insert into assistants(house_id, display_name, avatar_path) values ($1,'Luz',$2)", [HA, good(OWN_A)]); ok("casa com plano que inclui a assistente grava a foto", !r.err, r.err);
r = await sv("insert into assistants(house_id, display_name, avatar_path) values ($1,'Luz',$2)", [HB, good(OWN_B)]); ok("casa sem assistente no plano NÃO grava foto", !!r.err && /não inclui a assistente/.test(r.err), r.err);
r = await sv("insert into assistants(house_id, display_name) values ($1,'Luz sem foto')", [HB]); ok("a mesma casa grava o resto da assistente sem foto", !r.err, r.err);
r = await sv("update assistants set avatar_path = $2 where house_id=$1", [HA, good(OWN_B)]); ok("foto da pasta de OUTRA pessoa é recusada", !!r.err && /própria casa/.test(r.err), r.err);
for (const [nome, p] of [["caminho com ..", `${OWN_A}/../${OWN_B}/assistant-1731400000.webp`], ["outra extensão (.png)", `${OWN_A}/assistant-1731400000.png`], ["maiúsculas no id", `${OWN_A.toUpperCase()}/assistant-1731400000.webp`], ["sem número", `${OWN_A}/assistant-x.webp`], ["pasta a mais", `${OWN_A}/x/assistant-1731400000.webp`], ["link externo", "https://evil.example/a.webp"], ["só o nome", "assistant-1731400000.webp"], ["número curto", `${OWN_A}/assistant-123.webp`], ["texto sobrando no fim", `${OWN_A}/assistant-1731400000.webp?x=1`], ["quebra de linha no fim", `${OWN_A}/assistant-1731400000.webp\n`]]) {
  r = await sv("update assistants set avatar_path = $2 where house_id=$1", [HA, p]); ok(`caminho inválido recusado: ${nome}`, !!r.err, r.err);
}
r = await sv("update assistants set avatar_path = $2 where house_id=$1", [HA, `${OWN_A}/assistant-1731500000.jpg`]); ok("troca por outra foto da própria casa (.jpg) vale", !r.err, r.err);
r = await sv("update assistants set avatar_path = null where house_id=$1", [HA]); ok("remover a foto vale", !r.err && (await sv("select avatar_path from assistants where house_id=$1", [HA])).rows[0].avatar_path === null);
await sv("update assistants set avatar_path = $2 where house_id=$1", [HA, good(OWN_A)]);
await sv("update houses set plan='base' where id=$1", [HA]);
r = await sv("update assistants set display_name = 'Novo nome', enabled = false where house_id=$1", [HA]); ok("rebaixada de plano, a casa ainda edita o resto sem perder nem trocar a foto", !r.err, r.err);
r = await sv("update assistants set avatar_path = $2 where house_id=$1", [HA, good(OWN_A, 1731600000)]); ok("rebaixada de plano, não consegue trocar a foto", !!r.err, r.err);
await sv("update houses set plan='intermediario' where id=$1", [HA]); await sv("update assistants set enabled = true where house_id=$1", [HA]);

// ---------- 3) o que o cliente enxerga ----------
const av = (uid) => as("authenticated", uid, (c) => q(c, "select public.assistant_avatar_path($1) p", [OWN_A]));
r = await av(CLI); ok("cliente vê a foto da assistente ativa em plano com assistente", r.rows?.[0]?.p === good(OWN_A), JSON.stringify(r));
await sv("update assistants set enabled = false where house_id=$1", [HA]); r = await av(CLI); ok("assistente desativada: sem foto", r.rows?.[0]?.p === null);
await sv("update assistants set enabled = true where house_id=$1", [HA]); await sv("update houses set plan='base' where id=$1", [HA]); r = await av(CLI); ok("plano sem assistente (rebaixada): a foto some para o cliente", r.rows?.[0]?.p === null);
await sv("update houses set plan='intermediario' where id=$1", [HA]);
r = await av(OWN_B); ok("outra casa também consulta (a foto é pública na prática)", r.rows?.[0]?.p === good(OWN_A));
r = await as("anon", null, (c) => q(c, "select public.assistant_avatar_path($1)", [OWN_A])); ok("visitante sem login não consulta", !!r.err, r.err);
r = await as("authenticated", OWN_A, (c) => q(c, "select public.assistant_avatar_path($1) p", ["00000000-0000-0000-0000-000000000000"])); ok("dono inexistente: nulo, sem erro", !r.err && r.rows[0].p === null);

// ---------- 4) segurança de quem grava ----------
r = await as("authenticated", OWN_A, (c) => q(c, "update assistants set avatar_path = $2 where house_id=$1", [HA, good(OWN_A, 1731700000)])); ok("a dona grava a foto da própria casa pelo app", !r.err && r.n === 1, r.err);
r = await as("authenticated", OWN_B, (c) => q(c, "update assistants set avatar_path = $2 where house_id=$1", [HA, good(OWN_B)])); ok("outra casa não altera a assistente alheia (segurança por linha)", !r.err && r.n === 0, r.err ?? String(r.n));
r = await as("authenticated", CLI, (c) => q(c, "update assistants set avatar_path = $2 where house_id=$1", [HA, good(OWN_A)])); ok("cliente não altera nada", !r.err && r.n === 0, r.err ?? String(r.n));
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
ok("a função de guarda do gatilho não é executável por anon nem authenticated", !(await hasFn("anon", "public.assistants_avatar_guard()")) && !(await hasFn("authenticated", "public.assistants_avatar_guard()")));
ok("assistant_avatar_path: authenticated sim, anon não", (await hasFn("authenticated", "public.assistant_avatar_path(uuid)")) && !(await hasFn("anon", "public.assistant_avatar_path(uuid)")));
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
