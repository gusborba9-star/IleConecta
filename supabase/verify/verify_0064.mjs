// Verificação da migração 0064 num Postgres 16 LOCAL (nunca no Supabase remoto): aplica 0001–0063 com stubs de auth/storage, aplica 0064 duas vezes
// e compara com o comportamento vivo. Requer: Postgres em 127.0.0.1:5544 (user postgres, trust) e `npm i --no-save pg`. Uso: node supabase/verify/verify_0064.mjs
import { freshDb, connect, sql64 } from "./pgbase.mjs";
const results = []; let bad = 0;
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); if (!cond) bad++; };
const U = { owner: "00000000-0000-0000-0000-0000000000a1", client: "00000000-0000-0000-0000-0000000000b1" };
const ID = { house: "10000000-0000-0000-0000-000000000001", event: "20000000-0000-0000-0000-000000000001", res: "30000000-0000-0000-0000-000000000001" };

async function seed(c, { pid, ref = "cs_1", account = "acct_1", fee = 1500, ver = "v2-2026-10", gross = 10000, provider = "stripe", status = "pendente", res = ID.res, strict = null }) {
  await c.query("set session_replication_role = replica");
  await c.query(`insert into auth.users(id,email) values ($1,'o@x'),($2,'c@x') on conflict do nothing`, [U.owner, U.client]);
  await c.query(`insert into profiles(id,account_type,display_name) values ($1,'casa','Dono'),($2,'cliente','Cli') on conflict do nothing`, [U.owner, U.client]).catch(async () => {
    await c.query(`insert into profiles(id,account_type,display_name) select $1,(enum_range(null::account_type))[1],'Dono' on conflict do nothing`, [U.owner]);
    await c.query(`insert into profiles(id,account_type,display_name) select $1,(enum_range(null::account_type))[1],'Cli' on conflict do nothing`, [U.client]);
  });
  await c.query(`insert into houses(id,owner_id,name,slug) values ($1,$2,'Casa','casa') on conflict do nothing`, [ID.house, U.owner]);
  await c.query(`insert into events(id,house_id,title,price_cents,seats_total,starts_at) values (md5($1::text)::uuid,$2,'Ritual',$3,10, now()+interval '5 days') on conflict do nothing`, [res, ID.house, gross]);
  await c.query(`insert into reservations(id,event_id,user_id,status,expires_at) values ($1::uuid,md5($1::text)::uuid,$2,'aguardando_pagamento', now()+interval '1 day') on conflict do nothing`, [res, U.client]);
  await c.query(`insert into payments(id,reservation_id,provider,provider_ref,stripe_account_id,gross_cents,fee_cents,fee_rule_version,status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [pid, res, provider, ref, account, gross, fee, ver, status]);
  if (strict !== null) await c.query("update payments set identity_strict=$2 where id=$1", [pid, strict]).catch(() => {});
  await c.query("set session_replication_role = origin");
}
const snap = async (c, pid) => {
  const p = (await c.query("select status::text s, fee_cents from payments where id=$1", [pid])).rows[0];
  const l = (await c.query("select entry_type t, amount_cents a, fee_rule_version v, note from ledger_entries where payment_id=$1 order by entry_type, amount_cents", [pid])).rows;
  const r = (await c.query("select status::text s from reservations where id=$1", [ID.res])).rows[0];
  const n = (await c.query("select text from notifications order by text")).rows.map((x) => x.text);
  const po = (await c.query("select count(*)::int n from payouts")).rows[0].n;
  return JSON.stringify({ p, l, r, n, po });
};
const P1 = "40000000-0000-0000-0000-000000000001";

// ================= 1) equivalência de efeitos: base (confirm_payment antigo) x migrada (confirm_payment_for) =================
const base = await freshDb("t_base2", { max: 63 }); const mig = await freshDb("t_mig", { max: 63 });
ok("schema 0001-0063 aplica sem erro (base)", base.failed.length === 0, base.failed.join("; "));
const m = mig.c;
await m.query(sql64()); await m.query(sql64());
ok("0064 aplica 2x (idempotente) sobre o schema completo", true);
await seed(base.c, { pid: P1 }); await seed(m, { pid: P1 });
const rb = (await base.c.query("select public.confirm_payment('cs_1') r")).rows[0].r;
const rm = (await m.query("select public.confirm_payment_for($1,'stripe','cs_1','acct_1') r", [P1])).rows[0].r;
ok("confirmação: mesmo retorno", rb === rm && rm === "confirmado", `${rb}/${rm}`);
ok("confirmação: ledger, status, reserva, notificações e repasses idênticos ao legado", (await snap(base.c, P1)) === (await snap(m, P1)));
const l1 = JSON.parse(await snap(m, P1));
ok("ledger: bruto 10000, plataforma 1500, casa 8500", l1.l.some((x) => x.t === "bruto" && x.a == 10000) && l1.l.some((x) => x.t === "plataforma" && x.a == 1500) && l1.l.some((x) => x.t === "casa" && x.a == 8500));
ok("repetir confirmação é idempotente", (await m.query("select public.confirm_payment_for($1,'stripe','cs_1','acct_1') r", [P1])).rows[0].r === "ja_confirmado");

// ---- reembolso: mesmo efeito quando fee_cents está gravado ----
const RR = "50000000-0000-0000-0000-000000000001";
async function approveRefund(c, pid) {
  await c.query("set session_replication_role = replica");
  await c.query(`insert into refund_requests(id,payment_id,reservation_id,house_id,client_id,kind,amount_cents,status,decided_at) values ($1,$2,$3,$4,$5,'antes_do_inicio',10000,'aprovado',now())`, [RR, pid, ID.res, ID.house, U.client]);
  await c.query("set session_replication_role = origin");
}
await approveRefund(base.c, P1); await approveRefund(m, P1);
const xb = (await base.c.query("select public.complete_refund($1) r", [RR])).rows[0].r;
const xm = (await m.query("select public.complete_refund($1) r", [RR])).rows[0].r;
ok("reembolso: mesmo retorno e mesmos efeitos (fee_cents gravado)", xb === xm && (await snap(base.c, P1)) === (await snap(m, P1)), `${xb}/${xm}`);
const l2 = JSON.parse(await snap(m, P1)).l.filter((x) => x.a < 0);
ok("estorno reverte exatamente o registrado (-10000/-1500/-8500)", l2.length === 3 && l2.some((x) => x.a == -10000) && l2.some((x) => x.a == -1500) && l2.some((x) => x.a == -8500));
ok("complete_refund repetido é idempotente", (await m.query("select public.complete_refund($1) r", [RR])).rows[0].r === "ja_reembolsado");

// ---- histórico: comissão registrada (10%) com fee_cents nulo e regra antiga; regra atual daria 15% ----
const P2 = "40000000-0000-0000-0000-000000000002", R2 = "30000000-0000-0000-0000-000000000002", RR2 = "50000000-0000-0000-0000-000000000002";
async function histRefund(c, pid, resId, rrId) {
  await seed(c, { pid, ref: "cs_h", fee: 1000, ver: "v1-legacy", res: resId });
  await c.query("select public.confirm_payment('cs_h')");            // grava ledger com fee_cents=1000
  await c.query("set session_replication_role = replica");
  await c.query("alter table payments disable trigger user");
  await c.query("update payments set fee_cents = null where id=$1", [pid]);   // simula histórico sem fee_cents
  await c.query("alter table payments enable trigger user");
  await c.query(`insert into refund_requests(id,payment_id,reservation_id,house_id,client_id,kind,amount_cents,status,decided_at) values ($1,$2,$3,$4,$5,'antes_do_inicio',10000,'aprovado',now())`, [rrId, pid, resId, ID.house, U.client]);
  await c.query("set session_replication_role = origin");
  await c.query("select public.complete_refund($1)", [rrId]);
  return (await c.query("select entry_type t, amount_cents a, fee_rule_version v from ledger_entries where payment_id=$1 and amount_cents<0 order by entry_type", [pid])).rows;
}
const hb = await histRefund(base.c, P2, R2, RR2);
const hm = await histRefund(m, P2, R2, RR2);
ok("LEGADO (antes): fee_cents nulo recalcula pela regra atual (15%) — defeito confirmado", hb.some((x) => x.t === "plataforma" && x.a == -1500), JSON.stringify(hb));
ok("CORRIGIDO: estorno usa a comissão registrada no ledger (10%) e a regra original", hm.some((x) => x.t === "plataforma" && x.a == -1000) && hm.some((x) => x.t === "casa" && x.a == -9000) && hm.every((x) => x.v === "v1-legacy"), JSON.stringify(hm));

// ---- cancelamento: complete_cancel_refund também reverte o registrado ----
const P3 = "40000000-0000-0000-0000-000000000003", R3 = "30000000-0000-0000-0000-000000000003";
await seed(m, { pid: P3, ref: "cs_c", fee: 1000, ver: "v1-legacy", res: R3 });
await m.query("select public.confirm_payment_for($1,'stripe','cs_c','acct_1')", [P3]);
await m.query("set session_replication_role = replica"); await m.query("alter table payments disable trigger user"); await m.query("update payments set fee_cents=null where id=$1", [P3]); await m.query("alter table payments enable trigger user"); await m.query("set session_replication_role = origin");
await m.query("select public.complete_cancel_refund($1)", [P3]);
const cc = (await m.query("select entry_type t, amount_cents a, fee_rule_version v from ledger_entries where payment_id=$1 and amount_cents<0", [P3])).rows;
ok("cancelamento: reverte comissão registrada (10%) e regra original", cc.some((x) => x.t === "plataforma" && x.a == -1000) && cc.some((x) => x.t === "casa" && x.a == -9000) && cc.every((x) => x.v === "v1-legacy"), JSON.stringify(cc));
ok("cancelamento repetido idempotente", (await m.query("select public.complete_cancel_refund($1) r", [P3])).rows[0].r === "ja_estornado");
// sem ledger e sem fee_cents: falha (não recalcula)
const P4 = "40000000-0000-0000-0000-000000000004", R4 = "30000000-0000-0000-0000-000000000004";
await seed(m, { pid: P4, ref: "cs_n", fee: null, res: R4, status: "confirmado" });
let threw = ""; try { await m.query("select public.complete_cancel_refund($1)", [P4]); } catch (e) { threw = e.message; }
ok("sem ledger e sem fee_cents: estorno falha em vez de recalcular", /Comissão registrada não encontrada/.test(threw), threw);

// ================= 2/3) identidade =================
const mk = async (pid, resId, ref, o = {}) => seed(m, { pid, ref, res: resId, ...o });
const P5 = "40000000-0000-0000-0000-000000000005", R5 = "30000000-0000-0000-0000-000000000005";
await mk(P5, R5, "cs_5");
const conf = async (pid, prov, ref, acc) => (await m.query("select public.confirm_payment_for($1,$2,$3,$4) r", [pid, prov, ref, acc])).rows[0].r;
ok("conta divergente -> divergente", (await conf(P5, "stripe", "cs_5", "acct_X")) === "divergente");
ok("conta ausente em pagamento COM conta registrada -> divergente", (await conf(P5, "stripe", "cs_5", null)) === "divergente");
ok("provedor divergente -> divergente", (await conf(P5, "outro", "cs_5", "acct_1")) === "divergente");
ok("referência divergente -> divergente", (await conf(P5, "stripe", "cs_9", "acct_1")) === "divergente");
ok("nada foi confirmado nas divergências", (await m.query("select status::text s from payments where id=$1", [P5])).rows[0].s === "pendente");
const P6 = "40000000-0000-0000-0000-000000000006", R6 = "30000000-0000-0000-0000-000000000006";
await mk(P6, R6, "cs_6", { account: null });
ok("NOVO pagamento Stripe sem conta registrada NÃO confirma (identity_strict=true)", (await conf(P6, "stripe", "cs_6", "acct_1")) === "divergente" && (await conf(P6, "stripe", "cs_6", null)) === "divergente");
ok("linha nova nasce estrita", (await m.query("select identity_strict s from payments where id=$1", [P6])).rows[0].s === true);
// histórico: marcado pelo backfill (cria linha ANTES de aplicar 0064 em outro banco)
const hist = await freshDb("t_hist", { max: 63 });
await seed(hist.c, { pid: P6, ref: "cs_old", account: null, res: R6 });
await seed(hist.c, { pid: P5, ref: null, account: null, res: R5 });
await hist.c.query(sql64());
const flags = (await hist.c.query("select id, identity_strict s from payments order by id")).rows;
ok("backfill: histórico com ref e sem conta -> não estrito; sem ref continua estrito", flags.find((x) => x.id === P6).s === false && flags.find((x) => x.id === P5).s === true, JSON.stringify(flags));
ok("histórico sem conta confirma (compatibilidade preservada)", (await hist.c.query("select public.confirm_payment_for($1,'stripe','cs_old','acct_Z') r", [P6])).rows[0].r === "confirmado");
await hist.c.query(sql64());
ok("reaplicar 0064 NÃO altera marcações", (await hist.c.query("select identity_strict s from payments where id=$1", [P5])).rows[0].s === true);
await hist.c.end();
// confirmação legada por ref segue funcionando
const P7 = "40000000-0000-0000-0000-000000000007", R7 = "30000000-0000-0000-0000-000000000007";
await mk(P7, R7, "cs_7");
ok("confirm_payment(ref) legado delega e confirma", (await m.query("select public.confirm_payment('cs_7') r")).rows[0].r === "confirmado");
ok("confirm_payment(ref) desconhecido", (await m.query("select public.confirm_payment('nao_existe') r")).rows[0].r === "desconhecido");

// ---- sem presumir unicidade global de provider_ref ----
await m.query("alter table payments drop constraint if exists payments_provider_ref_key");
const P8 = "40000000-0000-0000-0000-000000000008", R8 = "30000000-0000-0000-0000-000000000008";
const P9 = "40000000-0000-0000-0000-000000000009", R9 = "30000000-0000-0000-0000-000000000009";
await mk(P8, R8, "cs_dup");
await m.query("set session_replication_role = replica");
await m.query(`insert into events(id,house_id,title,price_cents,seats_total,starts_at) values (md5($1::text)::uuid,$2,'Ritual',10000,10, now()+interval '5 days')`, [R9, ID.house]);
await m.query(`insert into reservations(id,event_id,user_id,status,expires_at) values ($1::uuid,md5($1::text)::uuid,$2,'aguardando_pagamento', now()+interval '1 day')`, [R9, U.client]);
await m.query(`insert into payments(id,reservation_id,provider,provider_ref,stripe_account_id,gross_cents,fee_cents,fee_rule_version,status) values ($1,$2,'outro','cs_dup',null,10000,1500,'v2-2026-10','pendente')`, [P9, R9]).catch((e) => results.push("  (aviso) " + e.message));
await m.query("set session_replication_role = origin");
const dupCount = (await m.query("select count(*)::int n from payments where provider_ref='cs_dup'")).rows[0].n;
if (dupCount === 2) {
  ok("confirm_payment_for confirma SÓ a linha validada por id mesmo com ref repetida", (await conf(P8, "stripe", "cs_dup", "acct_1")) === "confirmado" && (await m.query("select status::text s from payments where id=$1", [P9])).rows[0].s === "pendente");
  let amb = ""; try { await m.query("select public.confirm_payment('cs_dup')"); } catch (e) { amb = e.message; }
  ok("confirm_payment(ref) com ref ambígua falha explicitamente", /ambígua/.test(amb), amb);
} else ok("cenário de ref repetida montado", false, `linhas=${dupCount}`);

// ---- tarifa ----
const P10 = "40000000-0000-0000-0000-000000000010", R10 = "30000000-0000-0000-0000-000000000010";
await mk(P10, R10, "cs_10"); await conf(P10, "stripe", "cs_10", "acct_1");
const fee = async (acc, v = 250) => (await m.query("select public.record_processor_fee_for($1,'stripe','cs_10',$2,$3,'card') r", [P10, acc, v])).rows[0].r;
ok("tarifa: conta divergente -> divergente", (await fee("acct_X")) === "divergente");
ok("tarifa: registrada uma vez e idempotente", (await fee("acct_1")) === "registrada" && (await fee("acct_1", 999)) === "ja_registrada");
const lf = (await m.query("select amount_cents a from ledger_entries where payment_id=$1 and entry_type='taxa_provedor'", [P10])).rows;
ok("tarifa: 1 lançamento taxa_provedor=250 e forma de pagamento gravada", lf.length === 1 && lf[0].a == 250 && (await m.query("select payment_method pm from payments where id=$1", [P10])).rows[0].pm === "card");
ok("fila de tarifas pendentes", Number((await m.query("select count(*)::int n from public.payments_missing_processor_fee(50) where id=$1", [P10])).rows[0].n) === 0);

// ================= 1) lease com dono =================
const acq = async (c, id, secs = 120) => (await c.query("select outcome, lease_token from public.acquire_stripe_event($1,'t','acct_1','{}'::jsonb,$2)", [id, secs])).rows[0];
const fin = async (c, id, tok, out, err = null) => (await c.query("select public.finish_stripe_event($1,$2,$3,$4) r", [id, tok, out, err])).rows[0].r;
const a1 = await acq(m, "evt_L");
ok("lease: primeira aquisição devolve token", a1.outcome === "acquired" && !!a1.lease_token);
const a2 = await acq(m, "evt_L");
ok("lease: segunda aquisição enquanto vigente -> busy, sem token", a2.outcome === "busy" && a2.lease_token === null);
ok("lease: token errado não finaliza", (await fin(m, "evt_L", "00000000-0000-0000-0000-00000000dead", "done")) === false);
await m.query("update stripe_events set locked_until = now() - interval '1 second' where id='evt_L'");
const a3 = await acq(m, "evt_L");
ok("lease vencida: novo worker assume com NOVO token", a3.outcome === "acquired" && a3.lease_token !== a1.lease_token);
ok("worker antigo NÃO conclui", (await fin(m, "evt_L", a1.lease_token, "done")) === false);
ok("worker antigo NÃO rejeita", (await fin(m, "evt_L", a1.lease_token, "rejected", "x")) === false);
ok("worker antigo NÃO libera a execução do novo", (await fin(m, "evt_L", a1.lease_token, "retry", "x")) === false);
ok("trava do novo worker permanece intacta", (await acq(m, "evt_L")).outcome === "busy");
ok("novo worker conclui", (await fin(m, "evt_L", a3.lease_token, "done")) === true);
ok("concluído -> done; worker antigo continua sem efeito", (await acq(m, "evt_L")).outcome === "done" && (await fin(m, "evt_L", a1.lease_token, "retry")) === false);
const b1 = await acq(m, "evt_R");
ok("dono libera (retry) e nova aquisição ocorre", (await fin(m, "evt_R", b1.lease_token, "retry", "falhou")) === true && (await acq(m, "evt_R")).outcome === "acquired");
// concorrência REAL: N conexões simultâneas disputando o mesmo evento
const conns = await Promise.all(Array.from({ length: 12 }, () => connect("t_mig")));
const outs = await Promise.all(conns.map((c) => acq(c, "evt_C")));
ok("concorrência real (12 conexões): exatamente 1 adquire", outs.filter((o) => o.outcome === "acquired").length === 1 && outs.filter((o) => o.outcome === "busy").length === 11, JSON.stringify(outs.map((o) => o.outcome)));
const winner = outs.find((o) => o.outcome === "acquired");
await m.query("update stripe_events set locked_until = now() - interval '1 second' where id='evt_C'");
const outs2 = await Promise.all(conns.map((c) => acq(c, "evt_C")));
ok("concorrência real após expiração: exatamente 1 assume", outs2.filter((o) => o.outcome === "acquired").length === 1);
const w2 = outs2.find((o) => o.outcome === "acquired");
const fins = await Promise.all(conns.map((c, i) => fin(c, "evt_C", i % 2 ? winner.lease_token : w2.lease_token, "done")));
ok("concorrência real: só o dono vigente finaliza (1 true)", fins.filter(Boolean).length === 1, JSON.stringify(fins));
await Promise.all(conns.map((c) => c.end()));
// confirmação concorrente da mesma transação por várias conexões -> 1 único conjunto de lançamentos
const P11 = "40000000-0000-0000-0000-000000000011", R11 = "30000000-0000-0000-0000-000000000011";
await mk(P11, R11, "cs_11");
const cs2 = await Promise.all(Array.from({ length: 8 }, () => connect("t_mig")));
const rs = await Promise.all(cs2.map((c) => c.query("select public.confirm_payment_for($1,'stripe','cs_11','acct_1') r", [P11]).then((x) => x.rows[0].r)));
ok("confirmação concorrente (8 conexões): 1 confirmado, demais ja_confirmado", rs.filter((x) => x === "confirmado").length === 1 && rs.filter((x) => x === "ja_confirmado").length === 7, JSON.stringify(rs));
ok("confirmação concorrente: ledger lançado uma vez (3 linhas)", Number((await m.query("select count(*)::int n from ledger_entries where payment_id=$1", [P11])).rows[0].n) === 3);
await Promise.all(cs2.map((c) => c.end()));

// ================= gatilho/CHECK/permissões =================
const tr = async (sql) => { try { await m.query(sql); return "ok"; } catch (e) { return e.message; } };
ok("gatilho: provedor imutável", /provedor/.test(await tr(`update payments set provider='x' where id='${P5}'`)));
ok("gatilho: conta imutável depois de gravada", /conta de origem/.test(await tr(`update payments set stripe_account_id='acct_Z' where id='${P5}'`)));
ok("gatilho: identity_strict imutável", /marcação/.test(await tr(`update payments set identity_strict=false where id='${P5}'`)));
ok("gatilho: ref só muda enquanto pendente", /só muda enquanto/.test(await tr(`update payments set provider_ref='novo' where id='${P1}'`)) && (await tr(`update payments set provider_ref='cs_5b' where id='${P5}'`)) === "ok");
ok("CHECK: Stripe novo não aceita escrow/split", /payments_stripe_no_hold/.test(await tr(`update payments set escrow_id='e' where id='${P5}'`)));
await m.query("select set_config('test.role','authenticated',false)");
ok("permissão: authenticated não executa as funções novas", /Não autorizado|permission denied/.test(await tr(`select public.confirm_payment_for('${P5}','stripe','cs_5b','acct_1')`)) && /Não autorizado|permission denied/.test(await tr(`select * from public.acquire_stripe_event('e','t',null,'{}'::jsonb,120)`)));

console.log(results.join("\n")); console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} PASS / ${bad} FAIL`);
await m.end(); await base.c.end();
process.exit(bad ? 1 : 0);
