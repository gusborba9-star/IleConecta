// Verificação LOCAL da 0161 (Saúde mostra a manutenção ligada). Uso: node supabase/verify/verify_0161.mjs (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0; const ok = (n, c, d = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 240) : ""}`); if (!c) bad++; };
const name = "vf0161";
const { c: su } = await freshDb(name, { with64: true, max: 152 });
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;
  alter table cron.job add column if not exists active boolean default true;
  create table if not exists cron.job_run_details (jobid bigint, status text, start_time timestamptz default now());`);
const U = (n) => `a0161000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do update set display_name=excluded.display_name", [U(n), "U" + n]); }
await su.query("insert into admins(user_id,is_owner,perms) values ($1,true,'{}'), ($2,false,'{suporte}')", [U(1), U(2)]);
for (const f of ["0155_saude_da_plataforma_e_alertas", "0156_saude_rotina_em_execucao_nao_e_falha", "0157_saude_rodar_rotina_e_marcar_visto", "0160_interruptor_de_emergencia", "0161_saude_mostra_manutencao_ligada"]) {
  const mig = readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), "utf8");
  let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
  ok(`${f.slice(0, 4)} aplica e reaplica sem erro`, e === null, e ?? "");
}
const setM = (a, p, ago) => su.query("update platform_settings set value = jsonb_build_object('assistant',$1::boolean,'payments',$2::boolean,'message',null,'since', case when $3::text is null then null else to_char((now() - $3::interval) at time zone 'utc','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') end) where key='maintenance'", [a, p, ago]);
const alerts = async () => (await su.query("select code from health_alerts where code='manutencao_ligada'")).rows.length;
const notes = async () => (await su.query("select text from notifications where text like '%manutenção está ligada%'")).rows;
const health = async (uid) => { const c = await connect(name); try { await c.query("select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)", [uid]); await c.query("set role authenticated"); return (await c.query("select admin_health() h")).rows[0].h; } finally { await c.end(); } };

await su.query("delete from notifications"); await su.query("delete from health_alerts");
await setM(false, false, null); await su.query("select health_check()");
ok("desligada: sem alerta e sem aviso", (await alerts()) === 0 && (await notes()).length === 0);
await setM(false, true, "10 minutes"); await su.query("select health_check()");
ok("ligada há 10 min: ainda sem alerta (dentro da hora)", (await alerts()) === 0 && (await notes()).length === 0);
await setM(false, true, "2 hours 5 minutes"); await su.query("select health_check()");
const n1 = await notes();
ok("ligada há mais de 1 h: abre o alerta e avisa o dono no sino (1 aviso)", (await alerts()) === 1 && n1.length === 1, JSON.stringify(n1));
ok("o aviso diz o módulo e as horas, e só vai ao dono", /2 hora\(s\) \(pagamentos\)/.test(n1[0]?.text ?? "") && (await su.query("select user_id from notifications where text like '%manutenção está ligada%'")).rows.every((r) => r.user_id === U(1)));
await su.query("select health_check()"); await su.query("select health_check()");
ok("rodar a conferência de novo não repete o aviso (nem duplica o alerta)", (await notes()).length === 1 && (await alerts()) === 1);
await setM(true, true, "3 hours"); await su.query("select health_check()");
ok("com as duas chaves o texto cita as duas", (await notes()).length === 1 && (await alerts()) === 1);
const h = await health(U(1));
ok("admin_health traz o estado da manutenção para o dono", h.maintenance.assistant === true && h.maintenance.payments === true && /^\d{4}-/.test(h.maintenance.since), JSON.stringify(h.maintenance));
ok("alerta aparece na lista de alertas do painel", h.alerts.some((a) => a.code === "manutencao_ligada"));
await setM(false, false, null); await su.query("select health_check()");
ok("desligar limpa o alerta (próxima vez avisa de novo)", (await alerts()) === 0);
ok("admin_health sem manutenção: tudo falso", (await health(U(1))).maintenance.assistant === false);
let e2 = null; try { await health(U(2)); } catch (x) { e2 = x.message; }
ok("equipe que não é dono continua sem acesso ao painel de saúde", /restrita/.test(e2 ?? ""), e2 ?? "");
await su.query("update platform_settings set value='{\"assistant\":true,\"since\":\"lixo\"}'::jsonb where key='maintenance'");
let e3 = null; try { await su.query("select health_check()"); } catch (x) { e3 = x.message; }
ok("configuração corrompida não derruba a conferência (falha segura)", e3 === null, e3 ?? "");
await su.end(); console.log(bad ? `${bad} FALHA(S)` : "TUDO OK"); process.exit(bad ? 1 : 0);
