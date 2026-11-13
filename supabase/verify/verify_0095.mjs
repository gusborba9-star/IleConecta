// Verificação LOCAL da migration 0095 (reembolso de créditos em 7 dias).
// Uso: node supabase/verify/verify_0095.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb, connect } from "./pgbase.mjs";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vf0095", { with64: true, max: 95 });
ok("migrations 0001–0095 aplicadas sem erro", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const part = (f, marker) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8").split(marker)[1];
await su.query(part("0088_cobranca_motor.sql", "-- ============ 13) permissões ============"));
await su.query(part("0089_cobranca_tentativas_e_card.sql", "-- ============ 7) permissões ============"));
await su.query(part("0091_creditos_de_ia.sql", "-- ============ 7) permissões ============"));
await su.query(part("0094_cobranca_automatica_cartao.sql", "-- ============ 7) permissões ============"));
await su.query(part("0095_reembolso_creditos_7_dias.sql", "-- ============ 7) permissões ============"));
const as = async (role, uid, fn) => { const c = await connect("vf0095"); try { await c.query(`select set_config('test.uid',$1,false), set_config('test.role',$2,false)`, [uid ?? "", role]); await c.query(`set role ${role}`); return await fn(c); } finally { await c.end(); } };
const q = (c, sql, p) => c.query(sql, p).then((r) => ({ rows: r.rows, n: r.rowCount }), (e) => ({ err: e.message, code: e.code }));
const sv = (sql, p) => q(su, sql, p);
const ADM = "a1000000-0000-0000-0000-0000000000a1", OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2", CLI = "c1000000-0000-0000-0000-0000000000c1";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2";
for (const [u, t] of [[ADM, "cliente"], [OWN_A, "casa"], [OWN_B, "casa"], [CLI, "cliente"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into public.admins(user_id) values ($1)", [ADM]);
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','intermediario'), ($3,$4,'Casa B','casa-b','intermediario')", [HA, OWN_A, HB, OWN_B]);
const dateOf = (offsetDays) => sv("select (current_date + $1::int)::text d", [offsetDays]).then((r) => r.rows[0].d);
const noon = (d) => `${d} 12:00:00-03`; // meio-dia de Brasília do dia d
const issue = async (h, due, key, kind = "plan", item = "plan:intermediario", amt = 17990) => (await sv("select public.platform_charge_issue($1,$2,$3,$4,$5::date,$5::date,'Mensalidade do plano',$6) id", [h, kind, item, amt, due, key])).rows[0].id;
const dueList = async (now) => (await sv("select * from public.platform_autocharge_due($1::timestamptz)", [now])).rows;
const notes = async (owner) => (await sv("select text from notifications where user_id=$1 order by created_at, id", [owner])).rows.map((x) => x.text);
const save = async (h, setup, cust = "cus_A", pm = "pm_A", last4 = "4242") => sv("select public.platform_card_save($1,'stripe',$2,$3,$4,'visa',$5,12,2030) r", [h, setup, cust, pm, last4]);

await su.query(`update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'`);
let pn = 0, nn;
const hasFn = async (role, sig) => (await q(su, `select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
// compra e paga um pacote (como o provedor faria): devolve o id da fatura
const payPack = async (h, pack = "p200") => {
  const id = (await sv("select public.platform_credit_purchase($1,$2) id", [h, pack])).rows[0].id;
  const amt = (await sv("select amount_cents a from platform_charges where id=$1", [id])).rows[0].a;
  const ref = `cs_pack_${++pn}`;
  await sv("select public.platform_charge_attach($1,'stripe',$2,'card',null)", [id, ref]);
  const r = await sv("select public.platform_charge_confirm('stripe',$1,$2::bigint,300)", [ref, amt]);
  if (r.err) throw new Error(r.err);
  return { id, amt: Number(amt), ref };
};
const ledger = async (id) => (await sv("select entry_type t, amount_cents::int c from platform_ledger_entries where charge_id=$1 order by created_at, entry_type", [id])).rows;
const pack = async (id) => (await sv("select * from ai_credit_packs where charge_id=$1", [id])).rows[0];
const begin = (h, ch, now = null) => sv("select public.platform_credit_refund_begin($1,$2,null,coalesce($3::timestamptz, now())) r", [h, ch, now]);

// ---------- 1) valor proporcional ----------
const calc = async (p, r, s) => Number((await sv("select public.platform_credit_refund_cents($1::bigint,$2,$3) v", [p, r, s])).rows[0].v);
ok("170 de 200 em R$ 49,90 = R$ 42,42 (42,415 arredondado para cima)", (await calc(4990, 170, 200)) === 4242);
ok("nada usado devolve o valor integral", (await calc(4990, 200, 200)) === 4990 && (await calc(1990, 80, 80)) === 1990 && (await calc(8990, 500, 500)) === 8990);
ok("sobrou 1 resposta: R$ 0,25", (await calc(4990, 1, 200)) === 25);
let never = true;
for (const [p, s] of [[1990, 80], [4990, 200], [8990, 500]]) for (let rem = 1; rem <= s; rem++) { const v = await calc(p, rem, s); if (v > p || v < 1 || v > Math.ceil((p * rem) / s)) never = false; }
ok("nunca passa do valor pago, nunca é zero e nunca excede o proporcional arredondado para cima (todos os saldos dos 3 pacotes)", never);
ok("a soma de dois pedaços complementares nunca passa do total pago (sem devolver a mais)", (await calc(4990, 60, 200)) + (await calc(4990, 140, 200)) <= 4990 + 1);

// ---------- 2) pacote usado em parte ----------
const A = await payPack(HA);
await sv("update ai_credit_packs set remaining = 170 where charge_id=$1", [A.id]);
let r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_credit_refunds() s")); let s = r.rows?.[0]?.s;
ok("tela da casa A: pacote reembolsável com 170 restantes e valor R$ 42,42", s?.items?.length === 1 && s.items[0].remaining === 170 && s.items[0].refund_cents === 4242 && s.items[0].paid_cents === A.amt && s.window_days === 7, JSON.stringify(s));
r = await as("authenticated", OWN_B, (cc) => q(cc, "select public.my_credit_refunds() s")); ok("outra casa não vê o pacote da A", r.rows?.[0]?.s.items.length === 0);
r = await as("anon", null, (cc) => q(cc, "select public.my_credit_refunds()")); ok("visitante não consulta", !!r.err);
r = await as("authenticated", CLI, (cc) => q(cc, "select public.my_credit_refunds() s")); ok("quem não tem casa: sem erro", r.rows?.[0]?.s.has_house === false);

r = await begin(HB, A.id); ok("outra casa não pede o reembolso da A", !!r.err && /não pode ser reembolsada/.test(r.err), r.err);
r = await begin(HA, A.id, "2099-01-01T00:00:00Z"); ok("depois de 7 dias não reembolsa", !!r.err && /prazo de 7 dias/.test(r.err), r.err);
r = await begin(HA, A.id); const b1 = r.rows?.[0]?.r;
ok("começa o reembolso: R$ 42,42 por 170 respostas, com a referência do pagamento", !r.err && b1.amount_cents === 4242 && b1.credits === 170 && b1.ref === A.ref && b1.provider === "stripe" && b1.resume === false, r.err || JSON.stringify(b1));
ok("o saldo do pacote sai na hora (não dá para gastar enquanto devolve)", (await pack(A.id)).remaining === 0 && (await sv("select public.ai_credit_balance($1) b", [HA])).rows[0].b === 0);
r = await begin(HA, A.id); ok("repetir devolve o MESMO pedido pendente (queda de rede não duplica)", r.rows?.[0]?.r.refund_id === b1.refund_id && r.rows[0].r.resume === true);
const par = await Promise.all([1, 2, 3, 4, 5].map(() => begin(HA, A.id)));
ok("cinco pedidos simultâneos: sem erro e uma só linha", !par.some((x) => x.err) && (await sv("select count(*) n from platform_credit_refunds where charge_id=$1", [A.id])).rows[0].n === "1", par.map((x) => x.err).join("|"));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.my_credit_refunds() s")); ok("pendente sai da lista de reembolsáveis e entra no histórico", r.rows?.[0]?.s.items.length === 0 && r.rows[0].s.history[0].status === "pendente" && r.rows[0].s.history[0].amount_cents === 4242);
r = await sv("select * from public.platform_credit_refunds_pending(interval '0 seconds')"); ok("a rotina enxerga o pendente", r.rows.some((x) => x.refund_id === b1.refund_id && x.ref === A.ref && x.amount_cents === "4242"));

// ---------- 3) concluir ----------
await sv("delete from notifications where user_id=$1", [OWN_A]);
r = await sv("select public.platform_credit_refund_done($1,'re_1') r", [b1.refund_id]); ok("conclui", !r.err && r.rows[0].r.already === false, r.err);
ok("livro-razão: receita, tarifa e estorno de R$ 42,42 (nada apagado)", JSON.stringify(await ledger(A.id)) === JSON.stringify([{ t: "receita", c: A.amt }, { t: "taxa_provedor", c: 300 }, { t: "estorno", c: 4242 }]), JSON.stringify(await ledger(A.id)));
ok("estorno parcial: a fatura continua paga", (await sv("select status from platform_charges where id=$1", [A.id])).rows[0].status === "paga");
nn = await notes(OWN_A); ok("aviso: R$ 42,42 e 170 respostas", nn.length === 1 && /R\$ 42,42/.test(nn[0]) && /170 respostas/.test(nn[0]), nn[0]);
r = await sv("select public.platform_credit_refund_done($1,'re_1') r", [b1.refund_id]); ok("concluir de novo não duplica (lançamento nem aviso)", r.rows?.[0]?.r.already === true && (await ledger(A.id)).length === 3 && (await notes(OWN_A)).length === 1);
r = await begin(HA, A.id); ok("compra já reembolsada não reembolsa de novo", !!r.err && /já foi reembolsada/.test(r.err), r.err);
await sv("select public.platform_credit_refund_fail($1,'x')", [b1.refund_id]); ok("falha depois de concluído não mexe em nada", (await pack(A.id)).remaining === 0 && (await sv("select status from platform_credit_refunds where id=$1", [b1.refund_id])).rows[0].status === "concluido");
r = await sv("select * from public.platform_credit_refunds_pending(interval '0 seconds')"); ok("concluído sai da fila da rotina", r.rows.every((x) => x.refund_id !== b1.refund_id));

// ---------- 4) nada usado = integral; estorno total ----------
const B = await payPack(HA, "p80");
r = await begin(HA, B.id); const b2 = r.rows?.[0]?.r; ok("pacote intacto: valor integral", b2?.amount_cents === B.amt && b2.credits === 80, r.err || JSON.stringify(b2));
await sv("select public.platform_credit_refund_done($1,'re_2')", [b2.refund_id]);
ok("estorno total: a fatura vira 'estornada' e o saldo fica zerado", (await sv("select status from platform_charges where id=$1", [B.id])).rows[0].status === "estornada" && (await pack(B.id)).remaining === 0);
ok("livro-razão do estorno total fecha com a receita (receita - estorno = 0, tarifa absorvida)", (await ledger(B.id)).filter((x) => x.t !== "taxa_provedor").reduce((a, x) => a + (x.t === "receita" ? x.c : -x.c), 0) === 0);

// ---------- 5) o provedor recusa: o saldo volta e dá para tentar de novo ----------
const C = await payPack(HA);
await sv("update ai_credit_packs set remaining = 120 where charge_id=$1", [C.id]);
r = await begin(HA, C.id); const b3 = r.rows?.[0]?.r; ok("começa (120 restantes = R$ 29,94)", b3?.amount_cents === 2994 && (await pack(C.id)).remaining === 0, r.err || JSON.stringify(b3));
await sv("delete from notifications where user_id=$1", [OWN_A]);
await sv("select public.platform_credit_refund_fail($1,'charge_already_refunded')", [b3.refund_id]);
ok("recusa definitiva: saldo de 120 volta ao pacote", (await pack(C.id)).remaining === 120 && (await sv("select status from platform_credit_refunds where id=$1", [b3.refund_id])).rows[0].status === "falhou");
nn = await notes(OWN_A); ok("a casa é avisada e não perde nada", nn.length === 1 && /devolvidos ao saldo/.test(nn[0]));
await sv("select public.platform_credit_refund_fail($1,'x')", [b3.refund_id]); ok("repetir a falha não devolve em dobro", (await pack(C.id)).remaining === 120);
r = await sv("select public.platform_credit_refund_done($1,'re_x')", [b3.refund_id]); ok("não conclui um reembolso que falhou", !!r.err, r.err);
r = await begin(HA, C.id); ok("depois da falha dá para pedir de novo", !r.err && r.rows[0].r.resume === false && r.rows[0].r.amount_cents === 2994, r.err);
r = await sv("update ai_credit_packs set remaining = remaining + 5 where charge_id=$1", [C.id]); ok("fora da devolução o saldo continua só diminuindo (sem brecha)", !!r.err || (await pack(C.id)).remaining === 0, r.err);
await sv("select public.platform_credit_refund_fail($1,'x')", [(await sv("select id from platform_credit_refunds where charge_id=$1 and status='pendente'", [C.id])).rows[0].id]);

// ---------- 6) outros casos de recusa ----------
const D = await payPack(HB);
await sv("update ai_credit_packs set remaining = 0 where charge_id=$1", [D.id]);
r = await begin(HB, D.id); ok("pacote todo usado: nada a devolver", !!r.err && /já foram usados/.test(r.err), r.err);
const open = (await sv("select public.platform_credit_purchase($1,'p80') id", [HB])).rows[0].id;
r = await begin(HB, open); ok("fatura ainda não paga não reembolsa", !!r.err && /não pode ser reembolsada/.test(r.err), r.err);
r = await begin(HB, await issue(HB, await dateOf(3), "plan:B:1")); ok("mensalidade não é reembolsada por aqui", !!r.err && /não pode ser reembolsada/.test(r.err), r.err);
r = await begin(HB, "e0000000-0000-0000-0000-00000000dead"); ok("fatura inexistente", !!r.err);

// ---------- 7) proteções ----------
for (const sig of ["public.platform_credit_refund_begin(uuid,uuid,uuid,timestamptz)", "public.platform_credit_refund_done(uuid,text,timestamptz)", "public.platform_credit_refund_fail(uuid,text)", "public.platform_credit_refunds_pending(interval)", "public.platform_credit_refund_cents(bigint,int,int)"]) {
  ok(`só o servidor executa ${sig}`, !(await hasFn("anon", sig)) && !(await hasFn("authenticated", sig)) && (await hasFn("service_role", sig)));
}
ok("a casa só consulta a própria tela de reembolso", (await hasFn("authenticated", "public.my_credit_refunds()")) && !(await hasFn("anon", "public.my_credit_refunds()")));
r = await as("authenticated", OWN_A, (cc) => q(cc, "select public.platform_credit_refund_begin($1,$2)", [HA, A.id])); ok("a casa não chama o início do reembolso direto", !!r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "update platform_credit_refunds set amount_cents = 1")); ok("a casa não altera reembolso", !!r.err, r.err);
const packA = (await pack(A.id)).id;
r = await as("authenticated", OWN_A, (cc) => q(cc, "insert into platform_credit_refunds (charge_id, house_id, pack_id, credits, amount_cents) values ($1,$2,$3,1,1)", [A.id, HA, packA])); ok("nem cria", !!r.err, r.err);
r = await as("authenticated", OWN_A, (cc) => q(cc, "select count(*) n from platform_credit_refunds")); ok("a casa A lê só os próprios reembolsos", Number(r.rows?.[0]?.n) === 4 /* parcial, total e as 2 tentativas recusadas do pacote C */, JSON.stringify(r));
r = await as("authenticated", OWN_B, (cc) => q(cc, "select count(*) n from platform_credit_refunds")); ok("a casa B não lê os da A", r.rows?.[0]?.n === "0", JSON.stringify(r));
r = await as("authenticated", ADM, (cc) => q(cc, "select count(*) n from platform_credit_refunds")); ok("a administração lê todos", Number(r.rows?.[0]?.n) >= 4, JSON.stringify(r));
r = await sv("update platform_credit_refunds set amount_cents = 1 where id=$1", [b2.refund_id]); ok("reembolso encerrado não muda (nem pelo servidor)", !!r.err, r.err);
r = await sv("delete from platform_credit_refunds where id=$1", [b2.refund_id]); ok("reembolso não é apagado", !!r.err, r.err);
r = await sv("update platform_ledger_entries set amount_cents = 1 where charge_id=$1", [A.id]); ok("livro-razão segue imutável", !!r.err, r.err);
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
