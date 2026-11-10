// Verificação LOCAL da 0070 (F8 e F9) num PostgreSQL 16: monta o banco como o Supabase (privilégios padrão amplos para anon/authenticated),
// aplica 0001–0069, mede a exposição, aplica a 0070 duas vezes e ataca (TRUNCATE e troca de account_type pela API).
// Uso: node supabase/verify/verify_0070.mjs   (PG em 127.0.0.1:5544, user postgres)
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { STUBS, admin, connect } from "./pgbase.mjs";
const MIG = new URL("../migrations/", import.meta.url).pathname;
const DB = "v0070";
const a = await admin(); await a.query(`drop database if exists ${DB} with (force)`); await a.query(`create database ${DB}`); await a.end();
const su = await connect(DB); await su.query(STUBS);
await su.query("select set_config('test.role','',false)");
// Como no Supabase: tabelas novas nascem com todos os privilégios para anon, authenticated e service_role.
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;`);
const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const failed = [];
for (const f of files.filter((f) => Number(f.slice(0, 4)) <= 69)) {
  try { await su.query(readFileSync(MIG + f, "utf8").replace(/create extension[^;]*(pg_cron|pg_net|supabase_vault)[^;]*;/gi, "")); } catch (e) { failed.push(`${f}: ${e.message.slice(0, 100)}`); }
}
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); if (!c) bad++; };
ok("migrations 0001–0069 aplicadas sem erro", failed.length === 0, failed.join(" | "));
const count = async (priv, role) => Number((await su.query(`select count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and has_table_privilege($1, c.oid, $2)`, [role, priv])).rows[0].n);
const tables = Number((await su.query(`select count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')`)).rows[0].n);
const before = { trunc: await count("TRUNCATE", "authenticated"), ref: await count("REFERENCES", "authenticated"), trg: await count("TRIGGER", "authenticated"), sel: await count("SELECT", "authenticated"), upd: await count("UPDATE", "authenticated"), ins: await count("INSERT", "authenticated"), del: await count("DELETE", "authenticated"), asel: await count("SELECT", "anon") };
ok("pré-condição: antes da 0070 o authenticated tem TRUNCATE, REFERENCES e TRIGGER nas tabelas (exposição reproduzida)", before.trunc > 40 && before.ref > 40 && before.trg > 40, JSON.stringify(before));

// F8 antes: o ataque funciona
const U = { D: "d0000000-0000-0000-0000-00000000000d", A: "a0000000-0000-0000-0000-00000000000a" };
for (const [k, id] of Object.entries(U)) { await su.query(`insert into auth.users(id,email) values ($1,$2)`, [id, k + "@x"]); }
const prof = (await su.query(`select count(*) n from profiles`)).rows[0].n; // gatilho handle_new_user cria perfis a partir de metadados
await su.query(`update profiles set account_type='cliente' where id=$1`, [U.D]); await su.query(`update profiles set account_type='casa' where id=$2 and id=$1`, [U.A, U.A]);
const as = async (role, uid, fn) => { const c = await connect(DB); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const flipBefore = await as("authenticated", U.D, (c) => q(c, `update profiles set account_type='casa' where id=$1 returning account_type`, [U.D]));
ok("pré-condição F8: antes da 0070 o cliente consegue virar 'casa' pela API", flipBefore.n === 1, JSON.stringify(flipBefore));
await su.query(`update profiles set account_type='cliente' where id=$1`, [U.D]);

// aplica a 0070 duas vezes
const ROLL = new URL("../rollout/", import.meta.url).pathname;
const sql70 = process.env.PASSOS ? ["passo-24.sql", "passo-25.sql"].map((x) => readFileSync(ROLL + x, "utf8")).join("\n") : readFileSync(MIG + "0070_endurecimento_perfil_e_privilegios.sql", "utf8");
let err70 = null; try { await su.query(sql70); await su.query(sql70); } catch (e) { err70 = e.message; }
ok(`0070 ${process.env.PASSOS ? "(pelos passos 24–25) " : ""}aplica duas vezes sem erro (idempotente)`, err70 === null, err70 ?? "");

// F9
for (const priv of ["TRUNCATE", "REFERENCES", "TRIGGER"]) for (const role of ["anon", "authenticated"]) ok(`F9: ${role} sem ${priv} em nenhuma tabela de public (de ${tables})`, (await count(priv, role)) === 0, `${await count(priv, role)} tabela(s)`);
const after = { sel: await count("SELECT", "authenticated"), upd: await count("UPDATE", "authenticated"), ins: await count("INSERT", "authenticated"), del: await count("DELETE", "authenticated"), asel: await count("SELECT", "anon") };
ok("F9: authenticated e anon mantêm SELECT/INSERT/UPDATE/DELETE como antes (o app não perde nada)", JSON.stringify(after) === JSON.stringify({ sel: before.sel, upd: before.upd, ins: before.ins, del: before.del, asel: before.asel }), JSON.stringify(after));
for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) ok(`F9: service_role mantém ${priv} em todas as tabelas`, (await count(priv, "service_role")) === tables);
for (const role of ["anon", "authenticated"]) {
  const t = await as(role, role === "authenticated" ? U.D : null, (c) => q(c, `truncate table public.profiles`));
  ok(`F9: ataque — ${role} tentando TRUNCATE em profiles é negado`, Boolean(t.err) && /permission denied/.test(t.err), t.err);
  const t2 = await as(role, role === "authenticated" ? U.D : null, (c) => q(c, `truncate table public.payments, public.ledger_entries cascade`));
  ok(`F9: ataque — ${role} tentando TRUNCATE em payments/ledger é negado`, Boolean(t2.err) && /permission denied/.test(t2.err), t2.err);
  const t3 = await as(role, role === "authenticated" ? U.D : null, (c) => q(c, `create trigger x after insert on public.profiles for each row execute function public.set_updated_at()`));
  ok(`F9: ataque — ${role} tentando criar gatilho é negado`, Boolean(t3.err), t3.err);
}
await su.query(`create table public.tabela_nova_teste (id int)`);
ok("F9: tabela criada depois da 0070 já nasce sem TRUNCATE/REFERENCES/TRIGGER para anon e authenticated", (await su.query(`select has_table_privilege('anon','public.tabela_nova_teste','TRUNCATE') or has_table_privilege('authenticated','public.tabela_nova_teste','TRUNCATE') or has_table_privilege('authenticated','public.tabela_nova_teste','REFERENCES') or has_table_privilege('authenticated','public.tabela_nova_teste','TRIGGER') x`)).rows[0].x === false);
ok("F9: tabela nova mantém SELECT/INSERT/UPDATE/DELETE para authenticated (padrão do app)", (await su.query(`select has_table_privilege('authenticated','public.tabela_nova_teste','SELECT') and has_table_privilege('authenticated','public.tabela_nova_teste','INSERT') x`)).rows[0].x === true);

// F8
const flip = await as("authenticated", U.D, (c) => q(c, `update profiles set account_type='casa' where id=$1 returning account_type`, [U.D]));
ok("F8: cliente NÃO vira 'casa' pela API", Boolean(flip.err) && flip.code === "42501", flip.err);
ok("F8: o tipo do cliente continua 'cliente'", (await su.query(`select account_type::text t from profiles where id=$1`, [U.D])).rows[0].t === "cliente");
const flip2 = await as("authenticated", U.A, (c) => q(c, `update profiles set account_type='cliente' where id=$1 returning account_type`, [U.A]));
const tA = (await su.query(`select account_type::text t from profiles where id=$1`, [U.A])).rows[0].t;
ok("F8: a casa NÃO vira 'cliente' pela API", Boolean(flip2.err) && flip2.code === "42501", `${flip2.err ?? ""} (tipo agora: ${tA})`);
const upd = await as("authenticated", U.D, (c) => q(c, `update profiles set display_name='Novo Nome', city='Recife', bio='oi' where id=$1 returning display_name`, [U.D]));
ok("F8: o cliente continua editando nome, cidade e bio", upd.n === 1 && !upd.err, upd.err ?? "");
const same = await as("authenticated", U.D, (c) => q(c, `update profiles set account_type='cliente', display_name='Outro Nome' where id=$1 returning display_name`, [U.D]));
ok("F8: regravar o mesmo tipo (sem mudar) não é bloqueado", same.n === 1 && !same.err, same.err ?? "");
const anon = await as("anon", null, (c) => q(c, `update profiles set account_type='casa' where id=$1 returning id`, [U.D]));
ok("F8: visitante não altera perfil nenhum", Boolean(anon.err) || anon.n === 0, anon.err ?? `${anon.n} linha(s)`);
const hs = await as("authenticated", U.D, (c) => q(c, `insert into houses(owner_id,name,slug) values ($1,'Casa Falsa','casa-falsa') returning id`, [U.D]));
ok("F8: o cliente não consegue criar casa", Boolean(hs.err), hs.err);
const svc = await as("service_role", null, (c) => q(c, `update profiles set account_type='casa' where id=$1 returning account_type`, [U.D]));
ok("F8: o service_role (funções do servidor) ainda pode mudar o tipo", svc.n === 1 && !svc.err, svc.err ?? "");
await su.query(`update profiles set account_type='cliente' where id=$1`, [U.D]);
ok("F8: o administrador do banco (SQL Editor) ainda pode mudar o tipo", (await su.query(`select account_type::text t from profiles where id=$1`, [U.D])).rows[0].t === "cliente");
// cadastro novo continua criando perfil e casa
await su.query(`insert into auth.users(id,email,raw_user_meta_data) values ('c0000000-0000-0000-0000-0000000000c1','novo@x','{"account_type":"casa","display_name":"Casa Nova"}')`);
const nova = (await su.query(`select p.account_type::text t, (select count(*) from houses h where h.owner_id=p.id) h from profiles p where p.id='c0000000-0000-0000-0000-0000000000c1'`)).rows[0];
ok("F8: o cadastro de casa continua criando perfil 'casa' e a casa (gatilho handle_new_user)", nova?.t === "casa" && Number(nova.h) === 1, JSON.stringify(nova));
console.log(`\nRESUMO verify_0070: ${bad === 0 ? "tudo PASS" : bad + " FAIL"}`);
await su.end(); process.exit(bad ? 1 : 0);
