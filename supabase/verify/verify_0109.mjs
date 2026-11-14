// Verificação LOCAL da migration 0109 (casa de conta excluída some da rede). Uso: node supabase/verify/verify_0109.mjs
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
const PERMS = [["0088_cobranca_motor.sql", "-- ============ 13) permissões ============"], ["0099_reativacao_por_pagamento.sql", "-- ============ 5) permissões ============"], ["0101_cancelamento_e_tela_unica.sql", "-- ============ 9) permissões ============"]];
const name = "vf0109";
const { c: su, failed } = await freshDb(name, { with64: true, max: 109 });
ok("migrations 0001–0109 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
for (const [f, m] of PERMS) await su.query(part(f, m));
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows }), (e) => ({ err: e.message }));
const sv = (sql, p) => q(su, sql, p);
const as = async (uid, fn, role = "authenticated") => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
let i = 0;
async function mk(tag, type = "casa") {
  const hex = String(++i).padStart(4, "0");
  const O = `b0109000-0000-0000-0000-00000000${hex}`, H = `d0109000-0000-0000-0000-00000000${hex}`;
  await su.query("insert into auth.users(id,email) values ($1,$2)", [O, `${tag}@x.com`]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa','Salvador') on conflict (id) do update set account_type=$2", [O, type]);
  if (type === "casa") await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,'intermediario')", [H, O, `Casa ${tag}`, `casa-${tag}`]);
  return { O, H };
}
const A = await mk("a"), B = await mk("b"), CL = await mk("cl", "cliente"), ADM = await mk("adm", "cliente");
await su.query("insert into admins(user_id) values ($1)", [ADM.O]);
const sins = await sv("insert into services(house_id,kind,title,description,price_cents,active) values ($1,'limpeza','Limpeza','Limpeza espiritual completa para a casa',19900,true) returning id", [A.H]);
ok("serviço de teste criado", !sins.err, sins.err);
const countH = (uid, id, role) => as(uid, async (c) => Number((await q(c, "select count(*) n from houses where id=$1", [id])).rows[0].n), role);
ok("antes: o serviço aparece para o cliente", (await as(CL.O, async (c) => Number((await q(c, "select count(*) n from services where house_id=$1", [A.H])).rows[0].n))) === 1);
ok("antes: a casa aparece para visitante, cliente e outra casa", (await countH(null, A.H, "anon")) === 1 && (await countH(CL.O, A.H)) === 1 && (await countH(B.O, A.H)) === 1);
// exclui a conta da casa A como a rotina faz
await sv("insert into account_deletion_requests(user_id, execute_after) values ($1, now() - interval '1 minute')", [A.O]);
const rq = (await sv("select id from account_deletion_requests where user_id=$1", [A.O])).rows[0].id;
const del = await sv("select public.anonymize_account_and_queue($1,$2)", [A.O, rq]);
ok("conta da casa A excluída (anonimizada)", !del.err, del.err);
ok("depois: a casa NÃO aparece para visitante, cliente nem outra casa", (await countH(null, A.H, "anon")) === 0 && (await countH(CL.O, A.H)) === 0 && (await countH(B.O, A.H)) === 0);
ok("depois: nenhuma casa 'Casa encerrada' na lista pública", (await as(null, async (c) => Number((await q(c, "select count(*) n from houses where name='Casa encerrada'")).rows[0].n), "anon")) === 0);
ok("a administração continua vendo (auditoria)", (await countH(ADM.O, A.H)) === 1);
ok("a outra casa continua normal", (await countH(CL.O, B.H)) === 1);
const hid = (await sv("select public.house_is_hidden($1) h", [A.H])).rows[0].h;
ok("house_is_hidden vale com a cobrança desligada", hid === true);
ok("casa viva continua visível", (await sv("select public.house_is_hidden($1) h", [B.H])).rows[0].h === false);
ok("casa inexistente/nula não some", (await sv("select public.house_is_hidden(null) h")).rows[0].h === false);
r: {
  const r = await as(CL.O, (c) => q(c, "select public.house_is_hidden($1) h", [A.H]));
  ok("a função continua chamável pelo app e retorna verdadeiro", r.rows?.[0]?.h === true, r.err);
}
const svc = await as(CL.O, async (c) => Number((await q(c, "select count(*) n from services where house_id=$1", [A.H])).rows[0].n));
ok("serviços da casa excluída não aparecem", svc === 0);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total}/${total})`);
process.exit(bad ? 1 : 0);
