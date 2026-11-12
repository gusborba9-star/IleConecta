// Verificação LOCAL da função platform-billing (núcleo + provedor de teste) contra o banco REAL (0001–0089) em PostgreSQL 16.
// Uso: node supabase/verify/verify_platform_billing.mjs   (PG em 127.0.0.1:5544)
import { readFileSync } from "node:fs";
import { freshDb } from "./pgbase.mjs";
import * as core from "../functions/platform-billing/core.js";
import { createRegistry, ChargeStateError, DivergenceError } from "../functions/platform-billing/provider.js";
import { createFakeProvider } from "../functions/platform-billing/fakeProvider.js";
let bad = 0, total = 0; const ok = (n, c, d = "") => { total++; console.log(`${c ? "PASS" : "FAIL"} ${n}${d ? " — " + String(d).slice(0, 260) : ""}`); if (!c) bad++; };
const { c: su, failed } = await freshDb("vfpb", { with64: true, max: 89 });
ok("migrations 0001–0089 aplicadas", failed.length === 0, failed.join(" | "));
await su.query(`alter role service_role bypassrls; grant usage on schema public, auth to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;`);
const q = (sql, p) => su.query(sql, p).then((r) => r.rows);
const j = (o) => JSON.stringify(o);
const OWN_A = "b1000000-0000-0000-0000-0000000000b1", OWN_B = "b2000000-0000-0000-0000-0000000000b2";
const HA = "d1000000-0000-0000-0000-0000000000d1", HB = "d2000000-0000-0000-0000-0000000000d2";
for (const [u, t] of [[OWN_A, "casa"], [OWN_B, "casa"]]) {
  await su.query("insert into auth.users(id,email) values ($1,$2)", [u, u + "@x"]);
  await su.query("insert into profiles(id,account_type,display_name,city) values ($1,$2,'Pessoa Teste','Salvador') on conflict (id) do update set account_type=excluded.account_type", [u, t]);
}
await su.query("insert into houses(id,owner_id,name,slug,plan) values ($1,$2,'Casa A','casa-a','base'), ($3,$4,'Casa B','casa-b','base')", [HA, OWN_A, HB, OWN_B]);

// ---- porta do banco (mesmas chamadas que o store.js faz no Supabase, aqui direto no PostgreSQL) ----
const store = {
  config: async () => (await q("select public.platform_billing_config() c"))[0].c,
  chargeById: async (id) => (await q("select * from platform_charges where id=$1", [id]))[0] ?? null,
  houseOwner: async (h) => (await q("select owner_id from houses where id=$1", [h]))[0]?.owner_id ?? null,
  refCount: async (id) => Number((await q("select count(*) n from platform_charge_refs where charge_id=$1", [id]))[0].n),
  attach: (id, p, r, m, u) => q("select public.platform_charge_attach($1,$2,$3,$4,$5)", [id, p, r, m, u]),
  chargeIdByRef: async (p, r) => (await q("select public.platform_charge_of_ref($1,$2) id", [p, r]))[0].id,
  progress: async (p, r, s) => (await q("select public.platform_charge_progress($1,$2,$3) x", [p, r, s]))[0].x,
  confirm: async (p, r, paid, fee) => (await q("select public.platform_charge_confirm($1,$2,$3,$4) x", [p, r, paid, fee]))[0].x,
  recordFee: async (p, r, f) => (await q("select public.platform_charge_record_fee($1,$2,$3) x", [p, r, f]))[0].x,
  tick: async () => (await q("select public.platform_billing_tick() x"))[0].x,
  eventSeen: async (p, e) => (await q("select 1 from platform_billing_events where provider=$1 and event_id=$2", [p, e])).length > 0,
  logEvent: (row) => q("insert into platform_billing_events (provider,event_id,kind,charge_id,outcome,reason) values ($1,$2,$3,$4,$5,$6) on conflict do nothing", [row.provider, row.event_id, row.kind, row.charge_id ?? null, row.outcome, row.reason ?? null]),
  openWithRef: async (n) => q("select * from platform_charges where status in ('aberta','vencida','em_processamento') and provider_ref is not null order by updated_at desc limit $1", [n]),
  paidWithoutFee: async (n) => q("select * from platform_charges where status='paga' and processor_fee_cents is null and paid_ref is not null limit $1", [n]),
};
const silent = { error() {}, log() {} };
let T = Date.UTC(2026, 10, 12, 15, 0, 0);
const fake = createFakeProvider({ id: "fake", now: () => T });
const registry = createRegistry([fake]);
const cfgSet = (patch) => su.query("update platform_settings set value = value || $1::jsonb where key='billing_config'", [j(patch)]);
const cfgFor = (extra = {}) => ({ enabled: true, provider: { plan: "fake", extra_seat: "fake", credit_pack: "fake", highlight: "fake", boost: "fake" }, methods: { plan: ["card", "pix"], extra_seat: ["card", "pix"], credit_pack: ["card", "pix"], highlight: ["card", "pix"], boost: ["card", "pix"] }, ...extra });
await cfgSet(cfgFor());
const pay = (chargeId, userId, method = null) => core.openPayment({ registry, store, chargeId, userId, method, email: "casa@x", appUrl: "https://app.example", nowMs: T, log: silent });
const issue = async (h, idem, due = "2026-11-10", cand = "2026-11-10") => (await q("select public.platform_charge_issue($1,'plan','plan:base',8990,$2,$3,'Mensalidade do plano',$4) id", [h, due, cand, idem]))[0].id;
const get = async (id) => (await q("select * from platform_charges where id=$1", [id]))[0];
const errOf = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const hook = (type, ref, id = `evt_${Math.random().toString(36).slice(2)}`, sig = "ok") => core.processWebhook({ registry, store, providerId: "fake", rawBody: j({ id, type, ref }), headers: { "x-fake-signature": sig }, log: silent });

// ---------- 1) abrir o pagamento ----------
const c1 = await issue(HA, "idem-pb-a1");
await cfgSet({ enabled: false });
let e = await errOf(() => pay(c1, OWN_A)); ok("cobrança desligada: não abre pagamento", e instanceof ChargeStateError && e.code === "disabled", e?.message);
await cfgSet({ enabled: true });
e = await errOf(() => pay("00000000-0000-0000-0000-000000000000", OWN_A)); ok("fatura inexistente", e instanceof ChargeStateError && e.code === "not_found");
e = await errOf(() => pay(c1, OWN_B)); ok("outra casa não paga a fatura alheia", e instanceof ChargeStateError && e.code === "forbidden");
let r = await pay(c1, OWN_A);
let ch = await get(c1);
ok("abre a página, grava a referência atual e o histórico", /^https:\/\/pay\.example\//.test(r.url) && ch.provider === "fake" && !!ch.provider_ref && (await store.refCount(c1)) === 1, j(r));
const ref1 = ch.provider_ref;
ok("o valor enviado ao provedor é o da fatura (8990)", fake.sessions.get(ref1).amountCents === 8990);
r = await pay(c1, OWN_A);
ok("clicar de novo reaproveita a página aberta (não cria outra)", r.reused === true && (await store.refCount(c1)) === 1 && fake.calls.createCheckout === 1);
r = await pay(c1, OWN_A, "pix");
ok("trocar a escolha (só Pix) abre outra página; a antiga fica no histórico", r.reused === false && (await store.refCount(c1)) === 2 && (await get(c1)).provider_method === "pix");
const ref2 = (await get(c1)).provider_ref;
const [pa, pb] = await Promise.all([pay(c1, OWN_A, "card"), pay(c1, OWN_A, "card")]);
ok("dois cliques ao mesmo tempo resultam na mesma página (chave de idempotência)", pa.url === pb.url && (await store.refCount(c1)) === 3, `${pa.url} ${pb.url} refs=${await store.refCount(c1)}`);
e = await errOf(() => pay(c1, OWN_A, "boleto")); ok("meio que o painel não oferece é recusado", e instanceof ChargeStateError && e.code === "method_unavailable", e?.message);
await cfgSet({ methods: { ...cfgFor().methods, plan: ["card"] } });
e = await errOf(() => pay(c1, OWN_A, "pix")); ok("Pix desligado no painel: recusado", e instanceof ChargeStateError && e.code === "method_unavailable");
await cfgSet({ methods: cfgFor().methods });
await cfgSet({ provider: { ...cfgFor().provider, plan: "efi" } });
e = await errOf(() => pay(c1, OWN_A)); ok("provedor configurado sem adaptador: recusado com mensagem segura", e instanceof ChargeStateError && e.code === "provider_unavailable", e?.message);
await cfgSet({ provider: cfgFor().provider });
const ref3 = (await get(c1)).provider_ref;
T += 24 * 3600 * 1000; // as páginas expiram
r = await pay(c1, OWN_A, "card");
ok("página expirada: abre uma nova (Pix expira, a fatura não)", r.reused === false && (await get(c1)).provider_ref !== ref3 && (await store.refCount(c1)) === 4);
const ref4 = (await get(c1)).provider_ref;

// ---------- 2) avisos do provedor ----------
let w = await hook("paid", ref4, "evt_x1", "errada"); ok("assinatura inválida: 400 e nada muda", w.status === 400 && (await get(c1)).status !== "paga");
w = await core.processWebhook({ registry, store, providerId: "fake", rawBody: "{nao-json", headers: { "x-fake-signature": "ok" }, log: silent }); ok("aviso ilegível: 400", w.status === 400);
w = await hook("paid", "ref-que-nao-existe", "evt_unk"); ok("aviso de referência desconhecida: 200, rejeitado e registrado", w.status === 200 && w.body.rejected === true && (await q("select count(*) n from platform_billing_events where event_id='evt_unk:rej'"))[0].n === "1", j(w.body));
w = await hook("paid", ref4, "evt_notpaid"); ok("aviso 'pago' enquanto o provedor ainda diz aberto: nada é baixado (a verdade é consultada)", w.status === 200 && w.body.outcome === "open" && (await get(c1)).status !== "paga", j(w.body));
fake.markPending(ref4);
w = await hook("paid", ref4, "evt_pend"); ok("pagamento assíncrono (Pix ainda não compensado): em_processamento", w.body.outcome === "processing" && (await get(c1)).status === "em_processamento", j(w.body));
e = await errOf(() => pay(c1, OWN_A)); ok("em análise: não abre outra página", e instanceof ChargeStateError && e.code === "processing");
fake.markPaid(ref4, { feeCents: null });
w = await hook("paid", ref4, "evt_paid1"); ch = await get(c1);
ok("pago: fatura baixada com valor, data e referência; tarifa desconhecida segue nula", w.body.outcome === "paid" && ch.status === "paga" && ch.paid_ref === ref4 && ch.paid_amount_cents === "8990" && ch.processor_fee_cents === null, j(ch));
ok("só a receita foi lançada (tarifa desconhecida não vira zero)", j(await q("select entry_type from platform_ledger_entries where charge_id=$1", [c1])) === j([{ entry_type: "receita" }]));
w = await hook("paid", ref4, "evt_paid1"); ok("mesmo aviso de novo: duplicado, nada muda", w.body.duplicate === true && (await q("select count(*) n from platform_ledger_entries where charge_id=$1", [c1]))[0].n === "1");
w = await hook("paid", ref4, "evt_paid2"); ok("outro aviso do mesmo pagamento: idempotente", w.status === 200 && (await q("select count(*) n from platform_ledger_entries where charge_id=$1", [c1]))[0].n === "1");
e = await errOf(() => pay(c1, OWN_A)); ok("fatura paga não abre pagamento", e instanceof ChargeStateError && e.code === "paid");
fake.markPaid(ref1, { feeCents: 120 });
w = await hook("paid", ref1, "evt_dup"); ok("cliente pagou também por uma página antiga: duplicidade registrada para devolução", w.body.outcome === "duplicate" && (await q("select count(*) n from platform_billing_events where kind='pagamento_duplicado'"))[0].n === "1", j(w.body));
ok("a duplicidade não gera receita", (await q("select count(*) n from platform_ledger_entries where charge_id=$1 and entry_type='receita'", [c1]))[0].n === "1");

// ---------- 3) valor divergente, falha, pagamento por página antiga ----------
const c2 = await issue(HB, "idem-pb-b1");
await pay(c2, OWN_B); const b1 = (await get(c2)).provider_ref;
fake.markPaid(b1, { feeCents: 100, amountCents: 5000 });
w = await hook("paid", b1, "evt_div"); ok("provedor diz outro valor: rejeitado, fatura NÃO baixada", w.body.rejected === true && (await get(c2)).status !== "paga" && (await q("select count(*) n from platform_ledger_entries where charge_id=$1", [c2]))[0].n === "0", j(w.body));
fake.sessions.get(b1).amountCents = 8990; fake.sessions.get(b1).currency = "usd";
w = await hook("paid", b1, "evt_cur"); ok("moeda diferente de BRL: rejeitado", w.body.rejected === true && (await get(c2)).status !== "paga");
fake.sessions.get(b1).currency = "brl"; fake.sessions.get(b1).paid = false; fake.sessions.get(b1).state = "open";
fake.markExpired(b1);
w = await hook("failed", b1, "evt_fail"); ok("página expirada: fatura segue em aberto/vencida", w.body.outcome === "failed" && ["aberta", "vencida"].includes((await get(c2)).status));
T += 1000; await pay(c2, OWN_B, "card"); const b2 = (await get(c2)).provider_ref;
fake.markPaid(b1, { feeCents: 90 });
fake.sessions.get(b1).state = "complete";
w = await hook("paid", b1, "evt_late"); ch = await get(c2);
ok("pagou a página antiga ainda a tempo (depois de existir uma nova): vale e a fatura é baixada", w.body.outcome === "paid" && ch.status === "paga" && ch.paid_ref === b1, j(w.body));
e = await errOf(() => core.syncCharge({ registry, store, chargeId: c2, userId: OWN_A, log: silent })); ok("sync: outra casa não consulta a fatura alheia", e instanceof ChargeStateError && e.code === "forbidden");
r = await core.syncCharge({ registry, store, chargeId: c2, userId: OWN_B, log: silent }); ok("sync pela dona devolve o estado", r.status === "paga");

// ---------- 4) rotina diária: emite, confere o que ficou sem aviso e completa a tarifa ----------
const sw0 = await core.sweep({ registry, store, log: silent });
ok("rotina: completa a tarifa dos pagamentos já feitos (c1 tinha tarifa desconhecida; ref4 segue sem tarifa → continua nula)", (await get(c1)).processor_fee_cents === null && sw0.errors.length === 0, j(sw0));
fake.setFee(ref4, 175);
const sw1 = await core.sweep({ registry, store, log: silent });
ch = await get(c1);
ok("rotina: tarifa que o provedor liberou depois é gravada uma vez", ch.processor_fee_cents === "175" && sw1.fees >= 1, j(sw1));
ok("livro-razão: receita + tarifa da fatura", j(await q("select entry_type, amount_cents from platform_ledger_entries where charge_id=$1 order by 1", [c1])) === j([{ entry_type: "receita", amount_cents: "8990" }, { entry_type: "taxa_provedor", amount_cents: "175" }]));
const sw2 = await core.sweep({ registry, store, log: silent }); ok("rotina repetida não regrava tarifa", sw2.fees === 0 && (await get(c1)).processor_fee_cents === "175");
const c3 = await issue(HA, "idem-pb-a3", "2026-12-10", "2026-12-10");
await pay(c3, OWN_A); const r3 = (await get(c3)).provider_ref; fake.markPaid(r3, { feeCents: 60 });
const sw3 = await core.sweep({ registry, store, log: silent });
ok("rotina: pagamento SEM aviso (webhook perdido) é encontrado e baixado", (await get(c3)).status === "paga" && sw3.settled >= 1, j(sw3));
ok("rotina: tarifa vem junto quando já conhecida", (await get(c3)).processor_fee_cents === "60");
// rotina com o motor ligado: matrícula + ciclo
await q("insert into house_billing_plan (house_id, billing_day, started_on, active) values ($1, 20, '2026-10-01', true)", [HB]);
const sw4 = await core.sweep({ registry, store, log: silent });
ok("rotina: o motor emite a fatura do ciclo da casa matriculada", sw4.tick?.issued >= 1 && sw4.errors.length === 0, j(sw4));
const sw5 = await core.sweep({ registry, store, log: silent }); ok("rotina repetida não emite de novo", sw5.tick?.issued === 0);
// falha do provedor não derruba a rotina
const bomb = { ...fake, id: "fake", getCheckout: async () => { throw new Error("provedor fora do ar"); }, verifyWebhook: fake.verifyWebhook, parseEvent: fake.parseEvent, createCheckout: fake.createCheckout };
const c5 = await issue(HA, "idem-pb-a5", "2026-12-12", "2026-12-12"); await pay(c5, OWN_A);
const sw6 = await core.sweep({ registry: createRegistry([bomb]), store, log: silent }); ok("provedor fora do ar: a rotina registra o erro e termina (o banco segue emitindo e avisando)", sw6.errors.length >= 1 && sw6.tick !== null, j(sw6));
w = await core.processWebhook({ registry: createRegistry([bomb]), store, providerId: "fake", rawBody: j({ id: "evt_down", type: "paid", ref: (await get(c5)).provider_ref }), headers: { "x-fake-signature": "ok" }, log: silent });
ok("falha temporária no aviso: 500 (o provedor reenvia) e nada é baixado", w.status === 500 && (await get(c5)).status !== "paga");
ok("e o aviso que falhou NÃO fica marcado como tratado", (await q("select count(*) n from platform_billing_events where event_id='evt_down:ok'"))[0].n === "0");
w = await core.processWebhook({ registry, store, providerId: "fake", rawBody: j({ id: "evt_down", type: "paid", ref: (await get(c5)).provider_ref }), headers: { "x-fake-signature": "ok" }, log: silent });
ok("o reenvio do mesmo aviso é tratado normalmente", w.status === 200);

// ---------- 5) suspensão reage ao pagamento ----------
await q("update platform_settings set value = jsonb_set(value, '{enabled}', 'true') where key='billing_config'");
await q("select public.platform_house_billing_recompute($1, '2026-12-30T12:00:00-03:00')", [HA]);
ok("casa com fatura vencida há muito fica suspensa", (await q("select public.house_billing_level($1) l", [HA]))[0].l !== "ok");
const open = await q("select * from platform_charges where house_id=$1 and status in ('aberta','vencida')", [HA]);
for (const c of open) { await pay(c.id, OWN_A).catch(() => {}); const rr = (await get(c.id)).provider_ref; if (rr) { fake.markPaid(rr, { feeCents: 50 }); await hook("paid", rr, "evt_pay_" + c.id); } }
ok("pagando todas as faturas em aberto, a casa volta ao normal sozinha", (await q("select public.house_billing_level($1) l", [HA]))[0].l === "ok" && (await q("select count(*) n from platform_charges where house_id=$1 and status in ('aberta','vencida')", [HA]))[0].n === "0");
ok("nenhuma rejeição inesperada no histórico, exceto as simuladas", (await q("select count(*) n from platform_billing_events where outcome='rejeitado' and kind not in ('pagamento_duplicado') and event_id not like 'evt_%'"))[0].n === "0");
await su.end();
console.log(bad ? `\n${bad} FALHA(S) de ${total}` : `\nTUDO OK (${total})`); process.exit(bad ? 1 : 0);
