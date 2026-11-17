// Dia de mensalidades no banco LOCAL "carga": a rotina diária cria as mensalidades do mês e avisa; depois o Stripe confirma milhares de
// pagamentos ao mesmo tempo (e repete avisos, como acontece na vida real). Uso: node scripts/carga/mensalidades.mjs [conexoes=30]
// Zera o que o próprio teste cria (usa o mês seguinte ao último com mensalidades).
import { connect } from "../../supabase/verify/pgbase.mjs";
const W = Number(process.argv[2] ?? 30);
const su = await connect("carga");
const q = (c, sql, p) => c.query(sql, p);
const ms = (t) => Math.round(performance.now() - t);
const out = {};
const svc = async () => { const c = await connect("carga"); await c.query(`select set_config('test.uid','',false), set_config('test.role','service_role',false)`); await c.query("set role service_role"); return c; };

// regra de tarifas como em produção (o banco de carga é semeado sem ela) e marca do início, para desfazer tudo no fim
await q(su, `insert into fee_rule_versions(version, rates, reason) values ('v2-2026-10', '{"ritual":1500,"servico":400,"mensalidade":400}', 'Mesma regra vigente em produção') on conflict do nothing`);
const inicio = (await q(su, "select now() t")).rows[0].t;
const base = (await q(su, "select max(month) m from member_dues")).rows[0].m;
const desfazer = async () => {
  await q(su, "delete from ledger_entries where payment_id in (select p.id from payments p join member_dues d on d.id=p.member_due_id where d.month > $1)", [base]);
  await q(su, "delete from payments where member_due_id in (select id from member_dues where month > $1)", [base]);
  await q(su, "delete from member_dues where month > $1", [base]);
  await q(su, "delete from notifications where created_at >= $1", [inicio]);
};

// 1) rotina diária: cria as mensalidades de um mês novo e manda os avisos
const last = (await q(su, "select max(month) m from member_dues")).rows[0].m;
const next = (await q(su, "select (($1::date) + interval '1 month')::date d", [last])).rows[0].d;
const nextStr = new Date(next).toISOString().slice(0, 10);
let t = performance.now();
const r1 = (await q(su, "select member_dues_daily($1::date) r", [nextStr])).rows[0].r;
out.rotina_diaria = { ms: ms(t), ...r1 };
t = performance.now();
const r1b = (await q(su, "select member_dues_daily($1::date) r", [nextStr])).rows[0].r;
out.rotina_repetida = { ms: ms(t), ...r1b };

// 2) um pagamento pendente por mensalidade aberta do mês novo
const dues = (await q(su, "select d.id, d.amount_cents from member_dues d where d.status='aberta' and d.month=$1::date", [nextStr])).rows;
t = performance.now();
await q(su, `insert into payments(member_due_id, provider, provider_ref, stripe_account_id, gross_cents, status)
  select d.id, 'stripe', 'cs_carga_' || d.id, 'acct_carga', d.amount_cents, 'pendente' from member_dues d where d.status='aberta' and d.month=$1::date`, [nextStr]);
out.pagamentos_criados = { n: dues.length, ms: ms(t) };
const pays = (await q(su, `select p.id, p.provider_ref, p.stripe_account_id from payments p join member_dues d on d.id=p.member_due_id where d.month=$1::date and p.status='pendente' order by p.id`, [nextStr])).rows;

// 3) o Stripe confirma tudo ao mesmo tempo (W conexões), cada confirmação como o webhook faz
const conns = await Promise.all(Array.from({ length: W }, svc));
const lat = [], errs = [], res = {};
let idx = 0;
t = performance.now();
await Promise.all(conns.map(async (c) => {
  while (true) {
    const i = idx++; if (i >= pays.length) return;
    const p = pays[i], s = performance.now();
    try { const r = (await q(c, "select confirm_payment_for($1,'stripe',$2,$3) r", [p.id, p.provider_ref, p.stripe_account_id])).rows[0].r; res[r] = (res[r] ?? 0) + 1; }
    catch (e) { errs.push(e.message); }
    lat.push(performance.now() - s);
  }
}));
const total = ms(t); lat.sort((a, b) => a - b);
out.confirmacoes = { n: pays.length, conexoes: W, total_ms: total, por_segundo: Math.round(pays.length / (total / 1000)), mediana_ms: Math.round(lat[Math.floor(lat.length / 2)]), p95_ms: Math.round(lat[Math.floor(lat.length * 0.95)]), maximo_ms: Math.round(lat.at(-1)), resultados: res, erros: errs.length, primeiro_erro: errs[0] ?? null };

// 4) o mesmo aviso chegando de novo (Stripe repete), 500 ao mesmo tempo: nada pode duplicar
const antesL = (await q(su, "select count(*)::int n from ledger_entries l join payments p on p.id=l.payment_id join member_dues d on d.id=p.member_due_id where d.month=$1::date", [nextStr])).rows[0].n;
const antesN = (await q(su, "select count(*)::int n from notifications")).rows[0].n;
const rep = pays.slice(0, 500), res2 = {}; idx = 0; const errs2 = [];
await Promise.all(conns.map(async (c) => { while (true) { const i = idx++; if (i >= rep.length) return; const p = rep[i];
  try { const r = (await q(c, "select confirm_payment_for($1,'stripe',$2,$3) r", [p.id, p.provider_ref, p.stripe_account_id])).rows[0].r; res2[r] = (res2[r] ?? 0) + 1; } catch (e) { errs2.push(e.message); } } }));
// e o mesmo pagamento confirmado por 20 conexões no mesmo instante (corrida de verdade)
const one = pays[600], res3 = {};
await Promise.all(conns.slice(0, 20).map(async (c) => { try { const r = (await q(c, "select confirm_payment_for($1,'stripe',$2,$3) r", [one.id, one.provider_ref, one.stripe_account_id])).rows[0].r; res3[r] = (res3[r] ?? 0) + 1; } catch (e) { errs2.push(e.message); } }));
const depoisL = (await q(su, "select count(*)::int n from ledger_entries l join payments p on p.id=l.payment_id join member_dues d on d.id=p.member_due_id where d.month=$1::date", [nextStr])).rows[0].n;
const depoisN = (await q(su, "select count(*)::int n from notifications")).rows[0].n;
out.repeticao = { reenviados: rep.length, resultados: res2, mesmo_pagamento_20x: res3, erros: errs2.length, lancamentos_duplicados: depoisL - antesL, avisos_duplicados: depoisN - antesN };

// 5) conferência final: tudo pago, um lançamento triplo por pagamento, nada sobrando
const f = (await q(su, `select count(*) filter (where d.status='paga')::int pagas, count(*) filter (where d.status='aberta')::int abertas,
  (select count(*)::int from payments p2 join member_dues d2 on d2.id=p2.member_due_id where d2.month=$1::date and p2.status='confirmado') confirmados
  from member_dues d where d.month=$1::date`, [nextStr])).rows[0];
const porPag = (await q(su, `select count(*)::int n from (select p.id, count(*) c from payments p join member_dues d on d.id=p.member_due_id join ledger_entries l on l.payment_id=p.id where d.month=$1::date group by p.id having count(*) <> 3) x`, [nextStr])).rows[0].n;
const soma = (await q(su, `select count(*)::int n from (select p.id from payments p join member_dues d on d.id=p.member_due_id join ledger_entries l on l.payment_id=p.id where d.month=$1::date group by p.id
  having sum(case when l.entry_type='bruto' then l.amount_cents else 0 end) <> sum(case when l.entry_type in ('plataforma','casa') then l.amount_cents else 0 end)) x`, [nextStr])).rows[0].n;
out.conferencia = { mensalidades_pagas: f.pagas, ainda_abertas: f.abertas, pagamentos_confirmados: f.confirmados, pagamentos_sem_3_lancamentos: porPag, pagamentos_com_soma_errada: soma };

// 6) tarifa do Stripe chegando depois (a rotina de conciliação): precisa gerar o lançamento da casa
const some = pays.slice(0, 200); let feeErr = 0; idx = 0; t = performance.now();
await Promise.all(conns.map(async (c) => { while (true) { const i = idx++; if (i >= some.length) return; const p = some[i];
  try { await q(c, "select record_processor_fee_for($1,'stripe',$2,$3,120,'card')", [p.id, p.provider_ref, p.stripe_account_id]); } catch (e) { feeErr++; } } }));
const taxa = (await q(su, `select count(*)::int n from ledger_entries l where l.entry_type='taxa_provedor' and l.payment_id = any($1::uuid[])`, [some.map((p) => p.id)])).rows[0].n;
out.tarifa_do_stripe = { pagamentos: some.length, ms: ms(t), erros: feeErr, lancamentos_taxa_provedor: taxa };

console.log(JSON.stringify(out, null, 1));
await desfazer();
for (const c of conns) await c.end();
await su.end();
