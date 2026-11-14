// Verificação LOCAL da migration 0113 (Grátis: serviço presencial com valor exige agendamento pela plataforma).
// Uso: node supabase/verify/verify_0113.mjs   (PG em 127.0.0.1:5544)
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 220) : ""}`); if (!c) bad++; };
const name = "vf0113";
const { c: su, failed } = await freshDb(name, { with64: true, max: 113 });
ok("migrations 0001–0113 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
await su.query("revoke all on function public.trg_services_plan_guard(), public.house_payment_ready(uuid) from public, anon, authenticated");
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const as = async (uid, fn) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role','authenticated',false)`, [uid]); await c.query("set role authenticated"); return await fn(c); } finally { await c.end(); } };
let seq = 0;
async function mk(plan, acct) {
  const i = ++seq, hex = String(i).padStart(4, "0");
  const O = `b0113000-0000-0000-0000-00000000${hex}`, H = `d0113000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `u${i}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,'casa','Pessoa','Salvador') on conflict (id) do update set account_type='casa'", [O]);
  await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, O, `Casa ${i}`, `casa-${i}`, plan]);
  if (acct) await su.query("insert into house_payment_accounts(house_id,owner_id,provider,stripe_account_id,status,charges_enabled,payouts_enabled) values ($1,$2,'stripe','acct_'||$3,'ativa',true,true)", [H, O, String(i)]);
  return { O, H };
}
const ins = (H, delivery, bookable, price, active = true) => ["insert into services(house_id,kind,title,description,price_cents,active,delivery,bookable,duration_min) values ($1,'trabalho','Serviço de teste','Descrição longa o suficiente para o serviço ser válido e aceito.',$2,$3,$4,$5,30) returning id", [H, price, active, delivery, bookable]];

const G = await mk("gratis", true);
let r = await as(G.O, (c) => q(c, ...ins(G.H, "presencial", false, 10000)));
ok("Grátis: presencial com valor SEM agendamento é recusado, com o motivo em português", /Agendar horário pela plataforma/.test(r.err ?? ""), r.err);
r = await as(G.O, (c) => q(c, ...ins(G.H, "presencial", true, 10000)));
ok("Grátis: presencial com valor COM agendamento é aceito", !r.err, r.err);
const sid = r.rows?.[0]?.id;
r = await as(G.O, (c) => q(c, "update services set bookable=false where id=$1", [sid]));
ok("Grátis: desmarcar o agendamento de um serviço já ativo também é recusado", /Agendar horário pela plataforma/.test(r.err ?? ""), r.err);
r = await as(G.O, (c) => q(c, "update services set title='Outro nome de teste' where id=$1", [sid]));
ok("Grátis: editar só o título de serviço ativo segue livre", !r.err, r.err);
r = await as(G.O, (c) => q(c, ...ins(G.H, "transmissao", false, 10000)));
ok("Grátis: serviço não presencial sem agenda é aceito (a venda continua pela plataforma)", !r.err, r.err);
r = await as(G.O, (c) => q(c, ...ins(G.H, "presencial", false, 10000, false)));
ok("Grátis: rascunho (inativo) presencial sem agenda é aceito; só a publicação confere", !r.err, r.err);
const sid2 = r.rows?.[0]?.id;
r = await as(G.O, (c) => q(c, "update services set active=true where id=$1", [sid2]));
ok("Grátis: ativar esse rascunho sem agenda é recusado", /Agendar horário pela plataforma/.test(r.err ?? ""), r.err);

const NA = await mk("gratis", false);
r = await as(NA.O, (c) => q(c, ...ins(NA.H, "presencial", true, 10000)));
ok("Grátis sem conta de recebimento: continua recusado, com a mensagem da conta", /conta de recebimento/.test(r.err ?? ""), r.err);

for (const p of ["base", "intermediario", "maximo"]) {
  const P = await mk(p, false);
  r = await as(P.O, (c) => q(c, ...ins(P.H, "presencial", false, 10000)));
  ok(`${p}: presencial sem agenda e sem conta de recebimento é aceito (pode vender por fora)`, !r.err, r.err);
}
r = await q(su, ...ins(G.H, "presencial", false, 10000));
ok("servidor (sem usuário) não é barrado pelo gatilho", !r.err, r.err);
const perm = await q(su, `select has_function_privilege('authenticated','public.trg_services_plan_guard()','execute') a, has_function_privilege('anon','public.trg_services_plan_guard()','execute') b`);
ok("o gatilho não é chamável por usuário nem anônimo", perm.rows[0].a === false && perm.rows[0].b === false);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\n${total}/${total} OK`); process.exit(bad ? 1 : 0);
