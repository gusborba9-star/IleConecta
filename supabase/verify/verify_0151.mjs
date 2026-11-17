// Verificação LOCAL da migration 0151 (chamados: retenção de 24 meses). Uso: node supabase/verify/verify_0151.mjs  (bash /tmp/pgup.sh antes)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0151";
const { c: su, failed } = await freshDb(name, { with64: true, max: 150 });
ok("migrations 0001–0150 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const U = (n) => `a0151000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2]) { await su.query("insert into auth.users(id,email) values ($1,$2)", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'cliente',$2,'Salvador') on conflict (id) do nothing", [U(n), `Pessoa ${n}`]); }
await su.query("insert into admins(user_id,perms) values ($1,'{suporte}')", [U(2)]);
const def = async () => (await su.query("select pg_get_functiondef(p.oid) d, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_support_decide'")).rows[0];
const before = await def();
ok("antes: função com 12 e 24 meses", before.d.includes("else interval '12 months' end"));
// chamados antigos já encerrados: um com prazo de 12 meses, um já com 24, um sem prazo
const mk = async (extra = "") => (await su.query(`insert into support_cases(kind,priority,opened_by,title,description,first_response_due${extra ? "," + extra.split("|")[0] : ""}) values ('duvida','normal',$1,'Dúvida','Descrição da dúvida do cliente.',now()${extra ? "," + extra.split("|")[1] : ""}) returning id`, [U(1)])).rows[0].id;
const A = await mk("status,resolved_at,purge_after|'resolvido', now() - interval '2 months', now() + interval '10 months'");
const B = await mk("status,resolved_at,purge_after|'resolvido', now() - interval '2 months', now() + interval '22 months'");
const C = await mk();
const mig = readFileSync(new URL("../migrations/0151_chamados_retencao_24_meses.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0151 aplica e reaplica sem erro", e === null, e ?? "");
const after = await def();
ok("depois: só 24 meses, sem 12", !after.d.includes("'12 months'") && after.d.includes("'24 months'"));
ok("trava por módulo preservada (admin_can('suporte'))", after.d.includes("admin_can('suporte')"), after.d.match(/if not [^;]*;/)?.[0]);
ok("permissões iguais às de antes", after.acl === before.acl, before.acl + " → " + after.acl);
const pa = async (id) => (await su.query("select extract(epoch from (purge_after - resolved_at))/86400 as dias, purge_after from support_cases where id=$1", [id])).rows[0];
const ra = await pa(A), rb = await pa(B);
ok("encerrado com 12 meses passa a 24", Math.abs(ra.dias - 730) < 3, ra.dias);
ok("já com 24 meses continua igual (não muda nem diminui)", rb.dias > 700 && rb.dias <= 730 + 3, rb.dias);
const rc = (await su.query("select purge_after, resolved_at from support_cases where id=$1", [C])).rows[0];
ok("chamado aberto (sem prazo) continua sem prazo", rc.purge_after === null && rc.resolved_at === null);
// decisão nova de um chamado comum, sem prova: 24 meses
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
let err = null;
try { await as(U(2), (c) => c.query("select admin_support_decide($1,'orientacao','Orientado sobre o uso da plataforma e encerrado.')", [C])); } catch (x) { err = x.message; }
ok("administrador decide sem erro", err === null, err ?? "");
const d = (await su.query("select extract(epoch from (purge_after - resolved_at))/86400 as dias, status from support_cases where id=$1", [C])).rows[0];
ok("decisão de chamado comum guarda 24 meses", d.status === "resolvido" && Math.abs(d.dias - 730) < 3, JSON.stringify(d));
// quem não é administrador continua barrado
const D = await mk();
let err2 = null; try { await as(U(1), (c) => c.query("select admin_support_decide($1,'orientacao','Tentando decidir sem ser administrador.')", [D])); } catch (x) { err2 = x.message; }
ok("não administrador continua recusado", /not_admin/.test(err2 ?? ""), err2 ?? "");
// a rotina de limpeza ainda apaga o que venceu
await su.query("update support_cases set purge_after = now() - interval '1 day' where id=$1", [A]);
const n = (await su.query("select purge_support_cases() n")).rows[0].n;
ok("limpeza diária ainda apaga o vencido", n === 1 && (await su.query("select 1 from support_cases where id=$1", [A])).rowCount === 0, n);
await su.end();
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);
