// Verificação LOCAL da migration 0155 (saúde da plataforma e alertas). Uso: node supabase/verify/verify_0155.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0155";
const { c: su, failed } = await freshDb(name, { with64: true, max: 152 });
ok("migrations 0001–0154 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const run = async (uid, role, sql, p) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await c.query(sql, p); } finally { await c.end(); } };
const sv = (sql, p) => run(null, "service_role", sql, p);
const err = (pr) => pr.then(() => null, (x) => x.message);
const U = (n) => `a0155000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2, 3, 4]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do update set display_name=$2", [U(n), `Pessoa ${n}`]); }
await su.query("insert into admins(user_id,is_owner,perms) values ($1,true,'{}'), ($2,false,'{suporte}')", [U(1), U(2)]);
// simula o pg_cron (o banco local só tem o esboço)
await su.query(`alter table cron.job add column if not exists active boolean default true;
  create table if not exists cron.job_run_details (jobid bigint, status text, start_time timestamptz default now());
  insert into cron.job(jobid, jobname, schedule, command) values (1,'cada-minuto','* * * * *','x'), (2,'de-hora-em-hora','5 * * * *','x'), (3,'diaria','0 11 * * *','x'), (4,'a-cada-15','*/15 * * * *','x');`);

// ---- aplica
const mig = readFileSync(new URL("../migrations/0155_saude_da_plataforma_e_alertas.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0155 aplica e reaplica sem erro", e === null, e ?? "");
const mig56 = readFileSync(new URL("../migrations/0156_saude_rotina_em_execucao_nao_e_falha.sql", import.meta.url), "utf8");
let e56 = null; try { await su.query(mig56); await su.query(mig56); } catch (x) { e56 = x.message; }
ok("0156 (rotina em execução não é falha) aplica e reaplica sem erro", e56 === null, e56 ?? "");
ok("a migration agenda as duas rotinas (health-check a cada 10 min e purge-system-events)", /cron\.schedule\('health-check', '\*\/10 \* \* \* \*'/.test(mig) && /cron\.schedule\('purge-system-events'/.test(mig));

// ---- permissões e RLS
for (const t of ["system_events", "client_error_throttle", "health_alerts"]) {
  ok(`${t}: RLS ligada e sem acesso para anon/authenticated`, (await su.query("select relrowsecurity r from pg_class where relname=$1", [t])).rows[0].r === true
    && (await su.query("select count(*)::int n from information_schema.table_privileges where table_name=$1 and grantee in ('anon','authenticated','PUBLIC')", [t])).rows[0].n === 0);
}
ok("authenticated não lê o registro de erros", (await err(run(U(3), "authenticated", "select * from system_events"))) !== null);
ok("authenticated não lê alertas nem contadores", (await err(run(U(3), "authenticated", "select * from health_alerts"))) !== null && (await err(run(U(3), "authenticated", "select * from client_error_throttle"))) !== null);
const acl = async (f) => (await su.query("select proacl::text a from pg_proc where proname=$1", [f])).rows[0].a;
ok("report_client_error e admin_health: só authenticated e serviço (nunca anon)", !/anon=/.test(await acl("report_client_error")) && !/anon=/.test(await acl("admin_health")));
ok("log_system_event, health_check e purge: só o serviço", (await Promise.all(["log_system_event", "health_check", "purge_system_events", "health_notify", "health_cron"].map(async (f) => !/authenticated=|anon=/.test(await acl(f))))).every(Boolean));

// ---- limpeza do texto (sem dados pessoais)
const clean = async (t, m = 400) => (await su.query("select system_text_clean($1,$2) r", [t, m])).rows[0].r;
const rt = async (t) => (await su.query("select system_route_clean($1) r", [t])).rows[0].r;
ok("limpeza: e-mail, id, números longos, controle e espaços", await clean("Erro para maria.silva+x@gmail.com id 3f2c9a10-1b2c-4d5e-8f90-a1b2c3d4e5f6 cpf 12345678901\n\t em   /casa") === "Erro para [e-mail] id :id cpf # em /casa");
ok("limpeza: números curtos ficam (linha 12, coluna 345)", await clean("at app.js:12:345") === "at app.js:12:345");
ok("limpeza: tamanho limitado e nulo vira vazio", (await clean("x".repeat(1000), 50)).length === 50 && (await clean(null)) === "");
ok("limpeza: injeção de HTML/SQL vira só texto (não é interpretada)", await clean("<script>alert(1)</script>'; drop table x;--") === "<script>alert(1)</script>'; drop table x;--");
ok("rota: sem consulta, sem #, ids viram :id", await rt("/casa/3f2c9a10-1b2c-4d5e-8f90-a1b2c3d4e5f6?token=segredo#topo") === "/casa/:id" && await rt("/mensagens/12345/x") === "/mensagens/:id/x" && await rt("/rituais/987") === "/rituais/:id");
ok("rota: o token do convite na consulta não vai para o registro", !(await rt("/convite/abc?t=secreto")).includes("secreto"));

// ---- report_client_error
const rep = (uid, route, msg, src) => run(uid, "authenticated", "select report_client_error($1,$2,$3) r", [route, msg, src ?? "app"]).then((r) => r.rows[0].r, (x) => "ERRO:" + x.message);
ok("sem login não registra", String(await run(null, "anon", "select report_client_error('/x','erro qualquer','app') r").then(() => "passou", (x) => x.message)).match(/permission denied|Entre na sua conta/) !== null);
ok("logado registra e devolve true", await rep(U(3), "/casa/3f2c9a10-1b2c-4d5e-8f90-a1b2c3d4e5f6?x=1", "TypeError: x is undefined (maria@x.com)") === true);
const row = (await su.query("select * from system_events order by id desc limit 1")).rows[0];
ok("o registro NÃO tem a pessoa: sem user_id, sem e-mail, sem id na rota", row.kind === "erro_app" && !("user_id" in row) && row.route === "/casa/:id" && row.detail === "TypeError: x is undefined ([e-mail])", JSON.stringify(row));
ok("mensagem vazia ou de 1 letra não registra", (await rep(U(3), "/x", "")) === false && (await rep(U(3), "/x", " a ")) === false);
// limite por pessoa: 20 por hora
let accepted = 0; for (let i = 0; i < 40; i++) if ((await rep(U(4), "/x", `erro número ${i}`)) === true) accepted++;
ok("limite por pessoa: no máximo 20 por hora (40 tentativas)", accepted === 20, `aceitos ${accepted}`);
// limite geral: 600 por hora
await su.query("delete from system_events; delete from client_error_throttle");
await su.query("insert into system_events(kind,source,detail) select 'erro_app','app','x' from generate_series(1,599)");
const g1 = await rep(U(3), "/x", "um a mais"), g2 = await rep(U(2), "/x", "outro a mais");
ok("trava geral: o 600º entra e o 601º é recusado", g1 === true && g2 === false, `${g1} ${g2}`);
await su.query("delete from client_error_throttle; delete from system_events");
ok("origem gigante é cortada em 60 letras; origem com e-mail é limpa", await rep(U(3), "/x", "ok erro", "b ".repeat(300)) === true && (await su.query("select char_length(source) l from system_events order by id desc limit 1")).rows[0].l <= 60
  && await rep(U(3), "/x", "ok erro", "origem x@y.com") === true && (await su.query("select source from system_events order by id desc limit 1")).rows[0].source === "origem [e-mail]");
await su.query("delete from system_events; delete from client_error_throttle");
// concorrência: 80 pessoas ao mesmo tempo, cada uma 30 relatos → nunca passa de 20 por pessoa
for (let i = 10; i < 35; i++) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(i), `p${i}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente','Pessoa X','Salvador') on conflict (id) do nothing", [U(i)]); }
await Promise.all(Array.from({ length: 25 }, async (_, k) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [U(10 + k)]); await c.query("set role authenticated"); await Promise.all(Array.from({ length: 30 }, (_, j) => c.query("select report_client_error('/x',$1,'app')", [`erro ${k} ${j}`]).catch(() => null))); } finally { await c.end(); } }));
const porPessoa = (await su.query("select max(n)::int m, count(*)::int p, sum(n)::int s from client_error_throttle")).rows[0];
ok("concorrência: 25 pessoas × 30 relatos simultâneos → exatamente 20 gravados por pessoa (500) e todas as 750 tentativas contadas", (await su.query("select count(*)::int n from system_events")).rows[0].n === 25 * 20 && porPessoa.p === 25 && porPessoa.s === 25 * 30, JSON.stringify(porPessoa));
await su.query("delete from system_events; delete from client_error_throttle");

// ---- log_system_event
const lg = (kind, src, d, role = "service_role", uid = null) => run(uid, role, "select log_system_event($1,$2,$3) r", [kind, src, d]).then((r) => r.rows[0].r, (x) => "ERRO:" + x.message);
ok("serviço registra falha de IA e de função", await lg("ia_falha", "assistant-chat", "openrouter_429") === true && await lg("funcao_erro", "payments", "stripe indisponível") === true);
ok("authenticated e anon não registram", String(await lg("ia_falha", "x", "y", "authenticated", U(3))).startsWith("ERRO:") && String(await lg("ia_falha", "x", "y", "anon")).startsWith("ERRO:"));
ok("tipo inválido (erro_app) recusado para o serviço", String(await lg("erro_app", "x", "y")).startsWith("ERRO:"));
ok("detalhe vazio vira '(sem detalhe)' e e-mail é limpo", await lg("funcao_erro", "", "falhou para a@b.com") === true && (await su.query("select source, detail from system_events order by id desc limit 1")).rows[0].detail === "falhou para [e-mail]");
await su.query("delete from system_events");
await su.query("insert into system_events(kind,source,detail) select 'ia_falha','a','x' from generate_series(1,1000)");
ok("trava geral das falhas do servidor: 1.000 por hora", await lg("ia_falha", "a", "mais uma") === false);
await su.query("delete from system_events");

// ---- admin_health
const ah = (uid) => run(uid, "authenticated", "select admin_health() r").then((r) => r.rows[0].r, (x) => "ERRO:" + x.message);
ok("só o dono vê a saúde (administrador de módulo, cliente e anônimo recusados)", String(await ah(U(2))).startsWith("ERRO:") && String(await ah(U(3))).startsWith("ERRO:") && String(await run(null, "anon", "select admin_health() r").then(() => "x", (x) => "ERRO:" + x.message)).startsWith("ERRO:"));
await rep(U(3), "/casa/1234", "Falha A"); await rep(U(3), "/casa/1234", "Falha A"); await rep(U(3), "/mensagens", "Falha B"); await lg("ia_falha", "assistant-chat", "openrouter_502");
await su.query("insert into system_events(at,kind,source,detail) values (now() - interval '3 hours','erro_app','app','Falha velha')");
await su.query("insert into system_events(at,kind,source,detail) values (now() - interval '2 days','erro_app','app','Falha de 2 dias')");
const H = await ah(U(1));
ok("dono vê: contagem da última hora e de 24 h", H.last_hour.erro_app === 3 && H.last_hour.ia_falha === 1 && H.last_24h.erro_app === 4 && H.last_24h.funcao_erro === 0, JSON.stringify([H.last_hour, H.last_24h]));
ok("dono vê: erros mais frequentes agrupados (Falha A ×2 primeiro) e sem o de 2 dias", H.top[0].detail === "Falha A" && H.top[0].n === 2 && !H.top.some((t) => t.detail === "Falha de 2 dias"), JSON.stringify(H.top.map((t) => [t.detail, t.n])));
ok("dono vê: banco e conexões", H.db.size_bytes > 0 && H.db.connections >= 1);
ok("dono vê: lista das rotinas agendadas", Array.isArray(H.cron) && H.cron.length === 4 && H.cron.every((c) => "failed_24h" in c && "last_run" in c));
await su.query("delete from system_events");

// ---- health_check: rotinas
const hc = () => sv("select health_check() r").then((r) => r.rows[0].r);
const notes = async () => (await su.query("select user_id, text, href from notifications where text like 'Alerta técnico:%' order by created_at")).rows;
await su.query("delete from notifications; delete from health_alerts");
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (1,'succeeded',now() - interval '1 minute'), (2,'succeeded',now() - interval '10 minutes'), (3,'succeeded',now() - interval '5 hours'), (4,'succeeded',now() - interval '5 minutes')");
await hc();
ok("tudo saudável: nenhum aviso", (await notes()).length === 0);
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (2,'running',now()), (1,'starting',now())");
await hc();
ok("rotina em execução (running/starting) não é falha: nenhum aviso falso", (await notes()).length === 0 && (await su.query("select count(*)::int n from health_alerts")).rows[0].n === 0);
await su.query("delete from cron.job_run_details where status in ('running','starting')");
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (2,'failed',now() - interval '5 minutes')");
await hc();
let n1 = await notes();
ok("rotina que falhou: um aviso, só para o dono, levando à administração", n1.length === 1 && n1[0].user_id === U(1) && n1[0].href === "/admin" && /de-hora-em-hora/.test(n1[0].text), JSON.stringify(n1));
await hc(); await hc();
ok("rodar de novo logo em seguida não repete o aviso (6 h)", (await notes()).length === 1);
await su.query("delete from cron.job_run_details where status='failed'");
await hc();
ok("problema resolvido: o registro do alerta é liberado", (await su.query("select count(*)::int n from health_alerts")).rows[0].n === 0);
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (2,'failed',now() - interval '2 minutes')");
await hc();
ok("se o problema volta, avisa na hora de novo", (await notes()).length === 2);
await su.query("delete from cron.job_run_details; delete from health_alerts; delete from notifications");
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (1,'succeeded',now() - interval '3 hours'), (3,'succeeded',now() - interval '40 hours'), (4,'succeeded',now() - interval '1 minute')");
await hc();
const n2 = await notes();
ok("rotina frequente parada há mais de 2 h avisa; a diária (sem ficar parada) não", n2.length === 1 && /cada-minuto/.test(n2[0].text) && /não roda há mais de 2 horas/.test(n2[0].text), JSON.stringify(n2.map((x) => x.text)));
await su.query("update cron.job set active=false where jobid=1");
await su.query("delete from health_alerts; delete from notifications");
await hc();
ok("rotina desligada de propósito não avisa", (await notes()).length === 0);
await su.query("update cron.job set active=true where jobid=1");

// ---- health_check: picos de erro
await su.query("delete from cron.job_run_details; delete from health_alerts; delete from notifications");
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (1,'succeeded',now()), (2,'succeeded',now()), (4,'succeeded',now())");
await su.query("insert into system_events(kind,source,detail) select 'erro_app','app','e'||g from generate_series(1,14) g");
await hc();
ok("14 erros do app em 15 min: ainda sem aviso", (await notes()).length === 0);
await su.query("insert into system_events(kind,source,detail) values ('erro_app','app','e15')");
await hc();
ok("15 erros do app em 15 min: aviso de pico", (await notes()).length === 1 && /15 erros no app/.test((await notes())[0].text));
await su.query("insert into system_events(kind,source,detail) select 'ia_falha','a','f' from generate_series(1,5)");
await su.query("insert into system_events(kind,source,detail) select 'funcao_erro','payments','g' from generate_series(1,3)");
await hc();
ok("falhas de IA (5) e de função (3) avisam cada uma, e o de erro do app não repete", (await notes()).length === 3);
await su.query("update system_events set at = now() - interval '20 minutes'");
await hc();
ok("erros antigos (fora dos 15 min) liberam os alertas", (await su.query("select count(*)::int n from health_alerts")).rows[0].n === 0);
await su.query("delete from notifications; delete from health_alerts; delete from system_events");
// dono único recebe; sem dono ninguém recebe e nada quebra
await su.query("insert into system_events(kind,source,detail) select 'funcao_erro','p','x' from generate_series(1,3)");
await su.query("update admins set is_owner=false");
let e2 = null; try { await hc(); } catch (x) { e2 = x.message; }
ok("sem nenhum dono cadastrado não quebra (e ninguém é avisado)", e2 === null && (await notes()).length === 0, e2 ?? "");
await su.query("update admins set is_owner=true where user_id=$1", [U(1)]);

// ---- faxina
await su.query("delete from system_events; delete from client_error_throttle; delete from cron.job_run_details");
await su.query("insert into system_events(at,kind,source,detail) values (now() - interval '31 days','erro_app','a','velho'), (now() - interval '29 days','erro_app','a','novo')");
await su.query("insert into client_error_throttle(user_id,bucket,n) values ($1, now() - interval '4 hours', 3), ($1, date_trunc('hour', now()), 1)", [U(3)]);
await su.query("insert into cron.job_run_details(jobid,status,start_time) values (1,'succeeded', now() - interval '8 days'), (1,'succeeded', now() - interval '1 day')");
const pg = (await sv("select purge_system_events() r")).rows[0].r;
ok("faxina: apaga erros com mais de 30 dias, contadores com mais de 3 h e histórico de rotinas com mais de 7 dias", pg === 1
  && (await su.query("select count(*)::int n from system_events")).rows[0].n === 1
  && (await su.query("select count(*)::int n from client_error_throttle")).rows[0].n === 1
  && (await su.query("select count(*)::int n from cron.job_run_details")).rows[0].n === 1);

// ---- desempenho
await su.query("delete from system_events");
await su.query("insert into system_events(at,kind,source,route,detail) select now() - (random()*interval '30 days'), (array['erro_app','ia_falha','funcao_erro'])[1+floor(random()*3)::int], 'app', '/x', 'erro ' || (g % 50) from generate_series(1,100000) g");
let t = performance.now(); await ah(U(1)); const tAh = performance.now() - t;
t = performance.now(); await hc(); const tHc = performance.now() - t;
ok(`desempenho com 100 mil eventos: admin_health ${Math.round(tAh)} ms e health_check ${Math.round(tHc)} ms`, tAh < 1500 && tHc < 1500);

await su.end();
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);
