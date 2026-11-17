// Verificação LOCAL da migration 0157 (saúde da plataforma e alertas). Uso: node supabase/verify/verify_0157.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0157";
const { c: su, failed } = await freshDb(name, { with64: true, max: 152 });
ok("migrations 0001–0154 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const run = async (uid, role, sql, p) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await c.query(sql, p); } finally { await c.end(); } };
const sv = (sql, p) => run(null, "service_role", sql, p);

const err = (pr) => pr.then(() => null, (x) => x.message);
const U = (n) => `a0157000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2, 3]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do update set display_name = excluded.display_name", [U(n), `Pessoa ${n}`]); }
await su.query("insert into admins(user_id,is_owner,perms) values ($1,true,'{}'), ($2,false,'{suporte}')", [U(1), U(2)]);
await su.query(`alter table cron.job add column if not exists active boolean default true;
  create table if not exists cron.job_run_details (jobid bigint, status text, start_time timestamptz default now());
  create table t_probe (n int);
  insert into cron.job(jobid, jobname, schedule, command) values
   (1,'expire-stale-holds','* * * * *','insert into t_probe values (1)'),
   (2,'refund-sweep','*/10 * * * *','select 1/0'),
   (3,'purge-system-events','55 3 * * *','insert into t_probe values (99)'),
   (4,'health-check','*/10 * * * *','select public.health_check()'),
   (5,'run-account-deletions','20 * * * *','insert into t_probe values (77)'),
   (6,'promotions-tick','*/15 * * * *','select 1');`);
for (const f of ["0155_saude_da_plataforma_e_alertas", "0156_saude_rotina_em_execucao_nao_e_falha", "0157_saude_rodar_rotina_e_marcar_visto"]) {
  const mig = readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), "utf8");
  let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
  ok(`${f.slice(0, 4)} aplica e reaplica sem erro`, e === null, e ?? "");
}
const probe = async () => (await su.query("select count(*)::int n from t_probe")).rows[0].n;
const runs = async () => (await su.query("select routine, ok, note from routine_runs order by id")).rows;
const clear = () => su.query("delete from routine_runs");
const go = (uid, role, name) => run(uid, role, "select admin_run_routine($1) r", [name]).then((r) => r.rows[0].r);

// ---- lista segura
const L = (await su.query("select health_runnable() l")).rows[0].l;
ok("lista segura: sem limpezas (purge-*) e sem exclusão de contas", L.length === 11 && !L.some((n) => n.startsWith("purge-")) && !L.includes("run-account-deletions"), L.join(","));

// ---- quem pode
ok("pessoa comum não roda rotina", /restrita/.test(await err(go(U(3), "authenticated", "expire-stale-holds"))));
ok("administrador sem ser dono não roda rotina", /restrita/.test(await err(go(U(2), "authenticated", "expire-stale-holds"))));
ok("sem login (anon) não roda rotina nem enxerga a função", (await err(go(null, "anon", "expire-stale-holds"))) !== null);
ok("nada rodou até aqui", (await probe()) === 0 && (await runs()).length === 0);

// ---- o dono roda
const r1 = await go(U(1), "authenticated", "expire-stale-holds");
ok("dono roda: executa o comando do agendador uma vez e registra", r1.ok === true && (await probe()) === 1 && (await runs()).length === 1 && (await runs())[0].ok === true, JSON.stringify(r1));
ok("de novo logo em seguida: recusado (1 min) e nada roda de novo", /acabou de rodar/.test(await err(go(U(1), "authenticated", "expire-stale-holds"))) && (await probe()) === 1);
const r2 = await go(U(1), "authenticated", "refund-sweep");
ok("rotina que falha: devolve ok=false com mensagem limpa e registra a falha (sem derrubar)", r2.ok === false && /division by zero/.test(r2.message) && (await runs()).some((x) => x.routine === "refund-sweep" && x.ok === false), JSON.stringify(r2));
ok("rotina da lista mas que não existe no agendador: erro claro", /não encontrada/.test(await err(go(U(1), "authenticated", "handoff-remind"))));
const r4 = await go(U(1), "authenticated", "health-check");
ok("health-check real roda por aqui", r4.ok === true);

// ---- ataques
for (const bad of ["purge-system-events", "run-account-deletions", "nao-existe", "", "x'; drop table t_probe; --", "expire-stale-holds' or '1'='1", "EXPIRE-STALE-HOLDS"]) {
  ok(`nome fora da lista é recusado e nada roda: ${JSON.stringify(bad)}`, /não pode ser executada/.test(await err(go(U(1), "authenticated", bad))));
}
ok("nulo também é recusado", /não pode ser executada/.test(await err(run(U(1), "authenticated", "select admin_run_routine(null) r"))));
ok("as limpezas e a exclusão de contas não rodaram; a tabela de teste está íntegra", (await probe()) === 1);

// ---- paralelismo: 12 pedidos ao mesmo tempo para a mesma rotina => só um executa
await clear(); await su.query("delete from t_probe");
const rs = await Promise.all(Array.from({ length: 12 }, () => go(U(1), "authenticated", "expire-stale-holds").then(() => "ok", (x) => x.message)));
ok("12 pedidos simultâneos da mesma rotina: só 1 executa", rs.filter((x) => x === "ok").length === 1 && (await probe()) === 1 && (await runs()).length === 1, JSON.stringify(rs.filter((x) => x !== "ok").slice(0, 1)));

// ---- limite por hora
await clear();
await su.query("insert into routine_runs (routine, ok, at) select 'promotions-tick', true, now() - interval '5 minutes' from generate_series(1,60)");
ok("60 execuções na hora: a próxima é recusada", /Muitas execuções/.test(await err(go(U(1), "authenticated", "health-check"))));
await clear();

// ---- registro e acesso
ok("routine_runs: RLS ligada e sem acesso para anon/authenticated", (await su.query("select relrowsecurity r from pg_class where relname='routine_runs'")).rows[0].r === true
  && (await err(run(U(3), "authenticated", "select * from routine_runs"))) !== null && (await err(run(U(1), "authenticated", "select * from routine_runs"))) !== null);
const acl = async (f) => (await su.query("select proacl::text a from pg_proc where proname=$1", [f])).rows[0].a;
ok("admin_run_routine e admin_ack_alert: nunca anon", !/anon=/.test(await acl("admin_run_routine")) && !/anon=/.test(await acl("admin_ack_alert")) && !/anon=/.test(await acl("health_runnable")));
ok("health_cron e health_notify continuam só do serviço", !/authenticated=/.test(await acl("health_cron")) && !/authenticated=/.test(await acl("health_notify")));

// ---- "Já vi"
await su.query("delete from health_alerts; delete from notifications");
await su.query("insert into health_alerts(code,last_sent) values ('cron_falhou:refund-sweep', now()), ('pico:ia_falha', now())");
ok("pessoa comum e administrador comum não marcam alerta", /restrita/.test(await err(run(U(3), "authenticated", "select admin_ack_alert('pico:ia_falha')"))) && /restrita/.test(await err(run(U(2), "authenticated", "select admin_ack_alert('pico:ia_falha')"))));
const a1 = (await run(U(1), "authenticated", "select admin_ack_alert('pico:ia_falha') r")).rows[0].r;
const a2 = (await run(U(1), "authenticated", "select admin_ack_alert('pico:ia_falha') r")).rows[0].r;
const a3 = (await run(U(1), "authenticated", "select admin_ack_alert('nao-existe') r")).rows[0].r;
ok("dono marca: primeira vez true, repetir e código inexistente false", a1 === true && a2 === false && a3 === false);
let H = (await run(U(1), "authenticated", "select admin_health() h")).rows[0].h;
const al = (c) => H.alerts.find((x) => x.code === c);
ok("painel mostra visto/novo e as execuções manuais", al("pico:ia_falha").seen_at && al("cron_falhou:refund-sweep").seen_at === null && Array.isArray(H.manual_runs));
ok("painel diz quais rotinas podem rodar à mão", H.cron.length === 6 && H.cron.find((c) => c.name === "refund-sweep").can_run === true && H.cron.find((c) => c.name === "purge-system-events").can_run === false && H.cron.find((c) => c.name === "run-account-deletions").can_run === false);
await su.query("update health_alerts set last_sent = now() - interval '7 hours' where code='pico:ia_falha'");
await su.query("select health_notify('pico:ia_falha','Alerta técnico: teste')");
H = (await run(U(1), "authenticated", "select admin_health() h")).rows[0].h;
ok("aviso reenviado depois de 6 h volta o alerta para 'novo'", al("pico:ia_falha").seen_at === null);
await su.query("delete from routine_runs; insert into routine_runs(routine, ok, at) select 'health-check', true, now() - (g || ' minutes')::interval from generate_series(1,9) g");
H = (await run(U(1), "authenticated", "select admin_health() h")).rows[0].h;
ok("painel mostra no máximo as 5 últimas execuções manuais, da mais nova para a mais antiga", H.manual_runs.length === 5 && Date.parse(H.manual_runs[0].at) >= Date.parse(H.manual_runs[4].at));

// ---- faxina
await su.query("delete from routine_runs; insert into routine_runs(routine, ok, at) values ('health-check', true, now() - interval '31 days'), ('health-check', true, now() - interval '1 day')");
await sv("select purge_system_events()");
ok("faxina apaga execuções manuais com mais de 30 dias e guarda as recentes", (await su.query("select count(*)::int n from routine_runs")).rows[0].n === 1);

await su.end();
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);
