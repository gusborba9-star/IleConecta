// Verificação LOCAL da migration 0154 (reserva atômica das respostas da IA + modelo fixo). Uso: node supabase/verify/verify_0154.mjs  (bash /tmp/pgup.sh antes)
// Inclui o ATAQUE: dezenas de pedidos simultâneos contra a franquia, contra o limite por pessoa e contra o saldo de créditos, antes e depois da correção.
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
import { checkGate, resolveModels, DEFAULT_MODELS, USER_RATE } from "../functions/assistant-chat/logic.js";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const name = "vf0154";
const { c: su, failed } = await freshDb(name, { with64: true, max: 152 });
ok("migrations 0001–0153 aplicadas sem erro", failed.filter((f) => !f.startsWith("0068")).length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role; grant select on all tables in schema public to anon;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const sv = async (sql, p) => { const c = await connect(name); try { await c.query(`select set_config('test.uid','',false), set_config('test.role','service_role',false)`); await c.query("set role service_role"); return await c.query(sql, p); } finally { await c.end(); } };
const as = async (uid, role, sql, p) => { const c = await connect(name); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await c.query(sql, p); } finally { await c.end(); } };
const U = (n) => `a0154000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const mkUser = async (n, type = "cliente") => { await su.query("insert into auth.users(id,email) values ($1,$2) on conflict do nothing", [U(n), `u${n}@x.com`]); await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,$3,'Salvador') on conflict (id) do update set account_type=$2", [U(n), type, `Pessoa ${n}`]); };
const mkHouse = async (n, plan) => { await mkUser(n, "casa"); const H = `b0154000-0000-0000-0000-${String(n).padStart(12, "0")}`; await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,$3,$4,$5)", [H, U(n), `Casa ${n}`, `casa-${n}`, plan]); await su.query("insert into assistants(house_id, enabled, display_name) values ($1,true,'Lara')", [H]); return H; };
const matrix = (await su.query("select public.plan_matrix() m")).rows[0].m;
const sql = async (q, p) => su.query(q, p);

// ---- aplica a migration (duas vezes)
const mig = readFileSync(new URL("../migrations/0154_ia_reserva_de_resposta_e_modelo_fixo.sql", import.meta.url), "utf8");
let e = null; try { await su.query(mig); await su.query(mig); } catch (x) { e = x.message; }
ok("0154 aplica e reaplica sem erro", e === null, e ?? "");

// ---- permissões
ok("assistant_inflight: RLS ligada e sem acesso para anon/authenticated", (await sql("select relrowsecurity r from pg_class where relname='assistant_inflight'")).rows[0].r === true
  && (await sql("select count(*)::int n from information_schema.table_privileges where table_name='assistant_inflight' and grantee in ('anon','authenticated','PUBLIC')")).rows[0].n === 0);
const H0 = await mkHouse(1, "base");
for (const role of ["authenticated", "anon"]) {
  const r1 = await as(U(1), role, "select assistant_reserve($1,$2)", [H0, U(1)]).then(() => "passou", (x) => x.message);
  const r2 = await as(U(1), role, "select assistant_release(gen_random_uuid())").then(() => "passou", (x) => x.message);
  ok(`reservar/liberar recusados (permissão ou verificação interna) para ${role}`, /Não autorizado|permission denied/.test(r1) && /Não autorizado|permission denied/.test(r2), `${r1} | ${r2}`);
}
ok("tabela das reservas não é legível por quem não é serviço", await as(U(1), "authenticated", "select count(*) from assistant_inflight").then(() => false, () => true));

// ---- reserva: contagem, liberação, expiração
const rs = async (h, u) => (await sv("select assistant_reserve($1,$2) r", [h, u])).rows[0].r;
const r1 = await rs(H0, U(1)), r2 = await rs(H0, U(1)), r3 = await rs(H0, U(2));
ok("reserva conta as que já estavam em andamento (casa e pessoa)", r1.house === 0 && r1.user === 0 && r2.house === 1 && r2.user === 1 && r3.house === 2 && r3.user === 0, JSON.stringify([r1, r2, r3]));
await sv("select assistant_release($1)", [r2.id]);
const r4 = await rs(H0, U(1));
ok("liberar reduz a contagem", r4.house === 2 && r4.user === 1, JSON.stringify(r4));
await sv("select assistant_release($1)", [r2.id]); // liberar duas vezes não quebra
ok("liberar duas vezes não dá erro", true);
await su.query("update assistant_inflight set created_at = now() - interval '121 seconds' where id = any($1::uuid[])", [[r1.id, r3.id]]);
const r5 = await rs(H0, U(1));
ok("reserva esquecida há mais de 120 s expira sozinha", r5.house === 1 && r5.user === 1 && (await sql("select count(*)::int n from assistant_inflight where id = any($1::uuid[])", [[r1.id, r3.id]])).rows[0].n === 0, JSON.stringify(r5));
await su.query("delete from assistant_inflight");
ok("reservas de outra casa não se misturam", (await rs((await mkHouse(3, "base")), U(1))).house === 0);
await su.query("delete from assistant_inflight");

// ---- modelo: a casa não escolhe
const MODELO_CARO = "anthropic/claude-opus-99-caro";
await su.query("update assistants set model = null");
const setModel = (uid, role, h, m) => as(uid, role, "update assistants set model = $2 where house_id = $1 returning model", [h, m]);
let r = await setModel(U(1), "authenticated", H0, MODELO_CARO);
ok("dono da casa grava um modelo caro: o banco guarda 'padrão' (null)", r.rowCount === 1 && r.rows[0].model === null, JSON.stringify(r.rows));
const H5 = await mkHouse(5, "maximo");
await su.query("delete from assistants where house_id=$1", [H5]);
r = await as(U(5), "authenticated", "insert into assistants(house_id, enabled, display_name, model) values ($1,true,'Nova',$2) returning model", [H5, MODELO_CARO]);
ok("dono cria a assistente já com modelo caro: guarda null", r.rows[0].model === null, JSON.stringify(r.rows));
r = await as(U(1), "authenticated", "update assistants set model = 'ab' where house_id = $1 returning model", [H0]).then((x) => x.rows[0].model, (x) => "erro:" + x.message);
ok("valor curto demais continua recusado pela regra antiga ou vira null", r === null || String(r).startsWith("erro:"), String(r));
const H7 = await mkHouse(7, "maximo"); // a administração do teste também é dona de uma casa (é assim que a RLS deixa o UPDATE chegar ao gatilho)
await su.query("insert into admins(user_id, is_owner) values ($1, false) on conflict do nothing", [U(7)]);
r = await setModel(U(7), "authenticated", H7, DEFAULT_MODELS[1]);
ok("administração grava o modelo", r.rows[0]?.model === DEFAULT_MODELS[1], JSON.stringify(r.rows));
await su.query("delete from admins where user_id=$1", [U(7)]); // agora ele é só dono da casa; o modelo que a administração gravou fica
r = await as(U(7), "authenticated", "update assistants set display_name = 'Outro nome' where house_id = $1 returning model", [H7]);
ok("dono muda outro campo: o modelo gravado pela administração permanece", r.rows[0].model === DEFAULT_MODELS[1], JSON.stringify(r.rows));
r = await setModel(U(7), "authenticated", H7, MODELO_CARO);
ok("dono tenta trocar o modelo da administração por um caro: volta ao padrão", r.rows[0].model === null, JSON.stringify(r.rows));
r = await sv("update assistants set model = $2 where house_id = $1 returning model", [H7, DEFAULT_MODELS[0]]);
ok("serviço e banco gravam o modelo", r.rows[0].model === DEFAULT_MODELS[0]);
await su.query("update assistants set model = null");
// a função também ignora qualquer nome fora da lista (defesa em duas camadas)
ok("resolveModels: nome desconhecido/caro/vazio/não texto vira a lista da plataforma", [MODELO_CARO, "", null, undefined, 42, {}, " "].every((m) => JSON.stringify(resolveModels(m)) === JSON.stringify(DEFAULT_MODELS)));
ok("resolveModels: modelo da lista vai primeiro, sem repetir", JSON.stringify(resolveModels(DEFAULT_MODELS[1])) === JSON.stringify([DEFAULT_MODELS[1], DEFAULT_MODELS[0]]));

// ---- o ataque: pedidos simultâneos
// Um pedido da função, na ordem real: (reserva) → conta uso/crédito → porta de entrada → "modelo" (300 ms) → grava uso → libera.
const pedido = async (H, plan, user, { reserva }) => {
  const c = await connect(name);
  try {
    await c.query(`select set_config('test.uid','',false), set_config('test.role','service_role',false)`); await c.query("set role service_role");
    let rid = null, ih = 0, iu = 0;
    if (reserva) { const x = (await c.query("select assistant_reserve($1,$2) r", [H, user])).rows[0].r; rid = x.id; ih = x.house; iu = x.user; }
    const used = (await c.query("select count(*)::int n from assistant_usage where house_id=$1 and created_at >= date_trunc('month', now())", [H])).rows[0].n;
    const win = (await c.query("select count(*)::int n from assistant_usage where house_id=$1 and user_id=$2 and created_at >= now() - interval '10 minutes'", [H, user])).rows[0].n;
    const bal = (await c.query("select ai_credit_balance($1) b", [H])).rows[0].b;
    const gate = checkGate({ plan, assistant: { enabled: true }, usedThisMonth: used, usedByUserInWindow: win, matrix, creditBalance: bal, inflightHouse: ih, inflightUser: iu });
    if (gate) { if (rid) await c.query("select assistant_release($1)", [rid]); return gate; }
    await new Promise((res) => setTimeout(res, 300));
    await c.query("select assistant_record_usage($1,$2,'m',10,10)", [H, user]);
    if (rid) await c.query("select assistant_release($1)", [rid]);
    return "respondeu";
  } finally { await c.end(); }
};
const contar = (a) => a.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const usoMes = async (H) => (await sql("select count(*)::int n from assistant_usage where house_id=$1", [H])).rows[0].n;
const limiteBase = matrix.caps.base.assistant_replies;
const pessoas = async (from, n) => { for (let i = 0; i < n; i++) await mkUser(from + i); return Array.from({ length: n }, (_, i) => U(from + i)); };
const preUso = async (H, user, n) => sql("insert into assistant_usage(house_id,user_id,model,created_at) select $1,$2,'m',now() from generate_series(1,$3)", [H, user, n]);
const clientes = await pessoas(100, 60);
await mkUser(900); const ANTIGO = U(900); // quem já usou antes (não entra nos pedidos novos)

// A) franquia: faltam 5 respostas e 60 pessoas pedem ao mesmo tempo
for (const reserva of [false, true]) {
  const H = await mkHouse(reserva ? 11 : 10, "base");
  await preUso(H, ANTIGO, limiteBase - 5);
  const res = await Promise.all(clientes.map((u) => pedido(H, "base", u, { reserva })));
  const resp = res.filter((x) => x === "respondeu").length, total = await usoMes(H);
  if (!reserva) ok("A (ANTES): o defeito existe — a franquia é furada pelos pedidos simultâneos", resp > 5, `respondeu ${resp}, uso final ${total} de ${limiteBase}`);
  else ok("A (DEPOIS): exatamente as 5 que faltavam respondem; as outras recebem 'cota_mensal'", resp === 5 && total === limiteBase && contar(res).cota_mensal === 55, JSON.stringify(contar(res)) + ` uso ${total}`);
}
// B) limite por pessoa: uma pessoa dispara 60 pedidos de uma vez
for (const reserva of [false, true]) {
  const H = await mkHouse(reserva ? 13 : 12, "maximo");
  const res = await Promise.all(Array.from({ length: 60 }, () => pedido(H, "maximo", clientes[1], { reserva })));
  const resp = res.filter((x) => x === "respondeu").length;
  if (!reserva) ok("B (ANTES): o defeito existe — o limite por pessoa é furado", resp > USER_RATE.maxReplies, `respondeu ${resp}`);
  else ok(`B (DEPOIS): no máximo ${USER_RATE.maxReplies} respondem; o resto recebe 'muitas_mensagens'`, resp === USER_RATE.maxReplies && contar(res).muitas_mensagens === 60 - USER_RATE.maxReplies, JSON.stringify(contar(res)));
}
// C) créditos: Grátis com saldo de 3 respostas e 30 pedidos simultâneos
const pack = async (H, remaining) => { await su.query("set session_replication_role = replica"); await su.query("insert into ai_credit_packs(house_id,charge_id,size,remaining,expires_at) values ($1,gen_random_uuid(),80,$2,now()+interval '3 months')", [H, remaining]); await su.query("set session_replication_role = origin"); };
for (const reserva of [false, true]) {
  const H = await mkHouse(reserva ? 15 : 14, "gratis");
  await pack(H, 3);
  const res = await Promise.all(clientes.slice(2, 32).map((u) => pedido(H, "gratis", u, { reserva })));
  const resp = res.filter((x) => x === "respondeu").length;
  const saldo = (await sql("select ai_credit_balance($1) b", [H])).rows[0].b, ledger = (await sql("select count(*)::int n from ai_credit_ledger where house_id=$1", [H])).rows[0].n, total = await usoMes(H);
  if (!reserva) ok("C (ANTES): o defeito existe — respostas além do saldo (sem crédito para pagar)", resp > 3 && total > ledger, `respondeu ${resp}, créditos gastos ${ledger}`);
  else ok("C (DEPOIS): só 3 respondem, cada uma gasta 1 crédito, saldo 0, nenhuma resposta sem cobertura", resp === 3 && saldo === 0 && ledger === 3 && total === 3 && contar(res).plano_sem_assistente === 27, JSON.stringify(contar(res)) + ` saldo ${saldo} razão ${ledger} uso ${total}`);
}
// D) franquia + crédito: faltam 2 da franquia e há 2 créditos → 4 respostas no total
{
  const H = await mkHouse(16, "base");
  await preUso(H, ANTIGO, limiteBase - 2); await pack(H, 2);
  const res = await Promise.all(clientes.slice(32, 52).map((u) => pedido(H, "base", u, { reserva: true })));
  const resp = res.filter((x) => x === "respondeu").length, total = await usoMes(H);
  const ledger = (await sql("select count(*)::int n from ai_credit_ledger where house_id=$1", [H])).rows[0].n;
  ok("D: franquia (2) + créditos (2) = exatamente 4 respostas, 2 créditos gastos, mais nenhuma", resp === 4 && total === limiteBase + 2 && ledger === 2, JSON.stringify(contar(res)) + ` uso ${total} razão ${ledger}`);
}
// E) depois de tudo terminar, nada fica reservado e a casa volta a responder quando há folga
ok("nenhuma reserva presa depois dos ataques", (await sql("select count(*)::int n from assistant_inflight")).rows[0].n === 0);
{
  const H = await mkHouse(17, "intermediario");
  const r1 = await pedido(H, "intermediario", clientes[53], { reserva: true });
  const r2 = await pedido(H, "intermediario", clientes[53], { reserva: true });
  ok("pedidos em fila (um depois do outro) continuam respondendo normalmente", r1 === "respondeu" && r2 === "respondeu");
}
// F) pedido que falha no meio (cai antes de liberar): a reserva expira e não trava a casa
{
  const H = await mkHouse(18, "base");
  await preUso(H, ANTIGO, limiteBase - 1);
  const presa = await rs(H, clientes[54]); // reservou e "caiu"
  ok("com a reserva presa, o último lugar fica reservado", await pedido(H, "base", clientes[55], { reserva: true }) === "cota_mensal");
  await su.query("update assistant_inflight set created_at = now() - interval '121 seconds' where id=$1", [presa.id]);
  ok("passados 120 s a reserva presa some e a casa volta a responder", await pedido(H, "base", clientes[55], { reserva: true }) === "respondeu");
}
// G) desempenho da reserva
{
  const H = await mkHouse(19, "maximo");
  const t = performance.now(); const N = 200;
  for (let b = 0; b < N; b += 40) await Promise.all(Array.from({ length: 40 }, async (_, i) => { const x = await rs(H, clientes[(b + i) % 60]); await sv("select assistant_release($1)", [x.id]); }));
  const ms = performance.now() - t;
  ok(`desempenho: ${N} reservas+liberações (40 por vez) em ${Math.round(ms)} ms`, ms < 8000, `${(ms / N).toFixed(1)} ms cada`);
}

await su.end();
console.log(`\n${total - bad}/${total} verificações ok`);
process.exit(bad ? 1 : 0);
