import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRecovery, sanitizeInput, sanitizeScoring, UNIFORM_MESSAGE, MIN_RESPONSE_MS } from "../supabase/functions/account-recovery/core.js";

const casa = { user_id: "11111111-1111-4111-8111-111111111111", type: "casa", name: "Maria Silva", house_name: "Casa Luz", emails: ["maria.silva@gmail.com"], city: "Salvador", plan: "maximo",
  created_at: "2026-03-15T10:00:00Z", last_activity_at: "2026-11-20T10:00:00Z", tx: { count: 3, last_kind: "servico", last_value_cents: 19900, last_at: "2026-10-10T10:00:00Z" },
  assistant_name: "Lara", uses_assistant: true, members_count: 42, has_staff: true };
const legit = { action: "submit", contact_email: "novo@exemplo.com", claimed: { type: "casa", name: "Maria Silva", old_email: "maria.silva@gmail.com", city: "Salvador" },
  answers: { signup_month: "2026-03", last_access_month: "2026-11", plan: "maximo", had_tx: "sim", last_tx_kind: "servico", last_tx_value: "199", last_tx_month: "2026-10", uses_assistant: "sim", assistant_name: "Lara", has_members: "sim", members_count: "40", has_staff: "sim" },
  security_word: "agua viva" };

function harness(over = {}) {
  const calls = []; const mails = []; const state = { clock: 0, updated: [], burned: [], marked: [], pushed: [], secDue: [], secCalls: [], signIn: { ok: true, user_id: "11111111-1111-4111-8111-111111111111", access_token: "at", refresh_token: "rt" }, secState: { locked: false }, thr: new Map(), word: "ok", blocked: false, parentOk: true, facts: [casa], due: [], lookup: [], owner: "dono@x.com" };
  Object.assign(state, over.state ?? {});
  const rpc = async (fn, a) => {
    calls.push([fn, a]);
    switch (fn) {
      case "recovery_throttle_hit": { const n = (state.thr.get(a.p_bucket) ?? 0) + 1; state.thr.set(a.p_bucket, n); return n <= (over.limits?.[a.p_bucket.split(":")[0]] ?? a.p_limit); }
      case "recovery_blocked": return state.blocked;
      case "recovery_use_parent": return state.parentOk;
      case "recovery_parent_info": state.infoArgs = a; return state.info ?? null;
      case "recovery_scoring_get": return null;
      case "recovery_candidate_facts": return state.facts;
      case "check_security_word": return a.p_word === "" ? "not_answered" : state.word;
      case "recovery_submit": state.submitted = a; return "22222222-2222-4222-8222-222222222222";
      case "recovery_claim_owner_notice": return state.owner;
      case "recovery_due_mails": return state.due;
      case "recovery_mark_mail": state.marked.push(a); return null;
      case "recovery_issue_confirm": state.issued = a; return true;
      case "recovery_account_email": return "antigo@x.com";
      case "recovery_confirm_lookup": return state.lookup;
      case "recovery_burn_token": state.burned.push(a.p_id); return null;
      case "sec_event_push": state.pushed.push(a); return "ev1";
      case "sec_due_events": return state.secDue;
      case "ann_due_mails": return state.annDue ?? [];
      case "ann_mark_mailed": state.annMarked = (state.annMarked ?? 0) + 1; return null;
      case "sec_event_set_token": state.secCalls.push([fn, a]); return true;
      case "sec_event_mark_mailed": state.secCalls.push([fn, a]); return null;
      case "sec_login_check": state.secCalls.push([fn, a]); return state.secState;
      case "sec_login_fail": state.secCalls.push([fn, a]); return state.failResult ?? { locked: false };
      case "sec_login_ok": state.secCalls.push([fn, a]); return null;
      case "sec_unlock": case "sec_report": state.secCalls.push([fn, a]); return state.tokenOk ?? true;
      default: throw new Error("rpc desconhecida " + fn);
    }
  };
  const sleeps = [];
  const rec = createRecovery({ rpc, signIn: async () => state.signIn, sendMail: async (m) => { if (over.mailFails) throw new Error("x"); mails.push(m); }, adminUpdateEmail: async (u, e) => { if (over.updateFails) throw new Error("x"); state.updated.push([u, e]); },
    sleep: async (ms) => { sleeps.push(ms); }, now: () => state.clock, randomHex: () => "ab".repeat(32), sha256: async (s) => createHash("sha256").update(s).digest("hex"),
    cronOk: async (x) => x === "segredo-do-cron-com-mais-de-20", siteUrl: "https://ileconecta.com.br", log: () => {} });
  return { rec, calls, mails, state, sleeps };
}
const h = (o = {}) => ({ get: (k) => o[k.toLowerCase()] ?? null });
const sub = (hn, body, ip = "198.51.100.1") => hn.rec.handle({ method: "POST", headers: h(), body, ip });

test("pedido legítimo: grava avaliação, nunca grava a palavra digitada e responde mensagem uniforme", async () => {
  const x = harness(); const r = await sub(x, legit);
  assert.equal(r.status, 200); assert.equal(r.body.message, UNIFORM_MESSAGE);
  assert.equal(x.state.submitted.p_recommendation, "aprovar");
  assert.equal(x.state.submitted.p_word_checked, true);
  assert.equal(JSON.stringify(x.state.submitted).includes("agua viva"), false, "palavra não pode ser gravada");
  assert.equal(x.mails.length, 0, "o aviso ao dono sai pela fila de segurança, não direto");
  assert.deepEqual(x.state.pushed, [{ p_user: casa.user_id, p_kind: "recuperacao_pedida", p_detail: { to: "dono@x.com" } }]);
  assert.equal(x.mails.some((m) => m.to === "novo@exemplo.com"), false, "nada ao e-mail novo antes da decisão");
});

test("resposta e tempo são iguais com conta, sem conta, bloqueado e limite estourado", async () => {
  const cenarios = [{}, { state: { facts: [] } }, { state: { blocked: true } }, { limits: { em: 0 } }];
  const respostas = [];
  for (const c of cenarios) { const x = harness(c); const r = await sub(x, legit); respostas.push(JSON.stringify(r)); assert.deepEqual(x.sleeps, [MIN_RESPONSE_MS]); }
  assert.equal(new Set(respostas).size, 1);
});

test("falha interna também responde igual (não vaza erro)", async () => {
  const x = harness({ state: {} }); const orig = x.rec; 
  const y = harness(); y.state.facts = null; 
  const r = await sub(y, legit); assert.equal(r.status, 200); assert.equal(r.body.message, UNIFORM_MESSAGE);
  const z = harness({ mailFails: true }); const r2 = await sub(z, legit); assert.equal(r2.body.message, UNIFORM_MESSAGE);
});

test("sem conta: vai para a fila 'sem_conta' e nenhum e-mail ao dono de conta alguma", async () => {
  const x = harness({ state: { facts: [] } }); await sub(x, legit);
  assert.equal(x.state.submitted.p_lane, "sem_conta"); assert.equal(x.state.submitted.p_candidate, null); assert.equal(x.mails.length, 0);
});

test("palavra errada: não aprova; palavra não informada não conta como erro", async () => {
  const x = harness({ state: { word: "wrong" } }); await sub(x, legit);
  assert.notEqual(x.state.submitted.p_recommendation, "aprovar");
  const y = harness(); await sub(y, { ...legit, security_word: "" });
  assert.equal(y.state.submitted.p_word_checked, false);
});

test("chute em massa da palavra: depois de 10 tentativas na mesma conta, deixa de conferir", async () => {
  const x = harness({ state: { word: "wrong" } });
  for (let i = 0; i < 12; i++) await sub(x, { ...legit, contact_email: `a${i}@exemplo.com` }, `198.51.100.${i + 1}`);
  const checks = x.calls.filter((c) => c[0] === "check_security_word" && c[1].p_word !== "").length;
  assert.equal(checks, 10);
});

test("limites: por IP (6/h) e por e-mail (3/h) impedem gravar pedidos", async () => {
  const x = harness(); let n = 0;
  for (let i = 0; i < 10; i++) { await sub(x, legit); }
  n = x.calls.filter((c) => c[0] === "recovery_submit").length; assert.equal(n, 3, "e-mail: máximo 3");
  const y = harness();
  for (let i = 0; i < 10; i++) await sub(y, { ...legit, contact_email: `p${i}@exemplo.com` });
  assert.equal(y.calls.filter((c) => c[0] === "recovery_submit").length, 6, "IP: máximo 6");
});

test("segunda rodada exige o pedido anterior do mesmo contato (uso único)", async () => {
  const x = harness({ state: { parentOk: false } });
  await sub(x, { ...legit, round: 2, parent_id: "33333333-3333-4333-8333-333333333333" });
  assert.equal(x.state.submitted, undefined);
  const bad = await sub(harness(), { ...legit, round: 2, parent_id: "nao-e-uuid" });
  assert.equal(bad.status, 400);
});

test("entradas hostis: validação, tamanho, honeypot e lixo", async () => {
  assert.equal((await sub(harness(), null)).status, 400);
  assert.equal((await sub(harness(), { ...legit, contact_email: "isso nao e email" })).status, 400);
  assert.equal((await sub(harness(), { ...legit, claimed: { ...legit.claimed, type: "admin" } })).status, 400);
  const x = harness(); await sub(x, { ...legit, website: "http://spam" }); assert.equal(x.state.submitted, undefined, "honeypot não grava");
  const s = sanitizeInput({ ...legit, claimed: { ...legit.claimed, name: "x".repeat(5000) }, answers: { ...legit.answers, top_houses: ["a", "b", "c", "d", "e"], signup_month: "2026-13", had_tx: "talvez", __proto__: { x: 1 } } });
  assert.equal(s.claimed.name.length, 120); assert.equal(s.answers.top_houses.length, 3); assert.equal(s.answers.signup_month, ""); assert.equal(s.answers.had_tx, "");
  assert.equal(sanitizeInput({ ...legit, security_word: "y".repeat(500) }).word.length, 80);
  assert.equal((await harness().rec.handle({ method: "GET", headers: h(), body: null, ip: "" })).status, 405);
  assert.equal((await sub(harness(), { action: "outra" })).status, 400);
});

test("configuração do dono: só números em faixa segura valem", () => {
  const s = sanitizeScoring({ weights: { word: 9999, email: "x", city: 5 }, approve: { minStrongHits: -3, minRatio: 2 }, strong: ["word", "inventado"], minAnswered: 0 });
  assert.equal(s.weights.word, 40); assert.equal(s.weights.email, 25); assert.equal(s.weights.city, 5);
  assert.equal(s.approve.minRatio, 0.75); assert.equal(s.approve.minStrongHits, 2); assert.deepEqual(s.strong, ["word"]); assert.equal(s.minAnswered, 4);
  assert.deepEqual(sanitizeScoring(null), sanitizeScoring(undefined));
});

test("fila: sem o segredo da rotina ninguém processa", async () => {
  for (const sec of [null, "", "errado"]) { const x = harness({ state: { due: [{ id: "i", kind: "decisao", contact_email: "a@b.com", decision: "recusado" }] } });
    const r = await x.rec.handle({ method: "POST", headers: h({ "x-recovery-secret": sec }), body: { action: "process_queue" }, ip: "" }); assert.equal(r.status, 401); assert.equal(x.mails.length, 0); }
});

test("fila: decisão vai só ao e-mail novo; confirmação com link só no novo e aviso ao antigo; segredo não vaza em texto", async () => {
  const x = harness({ state: { due: [
    { id: "r1", kind: "decisao", contact_email: "novo@exemplo.com", decision: "aprovado", round: 1 },
    { id: "r2", kind: "decisao", contact_email: "outro@exemplo.com", decision: "recusado", round: 1 },
    { id: "r3", kind: "decisao", contact_email: "terceiro@exemplo.com", decision: "segunda_rodada", round: 1 },
    { id: "r4", kind: "confirmacao", contact_email: "novo@exemplo.com", decision: "aprovado", decision_account: casa.user_id } ] } });
  const r = await x.rec.handle({ method: "POST", headers: h({ "x-recovery-secret": "segredo-do-cron-com-mais-de-20" }), body: { action: "process_queue" }, ip: "" });
  assert.equal(r.body.processed, 4);
  const conf = x.mails.find((m) => m.subject.startsWith("Confirme")); assert.equal(conf.to, "novo@exemplo.com");
  assert.match(conf.link, /^https:\/\/ileconecta\.com\.br\/recuperar-acesso\/confirmar#t=[0-9a-f]{64}$/);
  assert.deepEqual(x.state.pushed, [{ p_user: casa.user_id, p_kind: "recuperacao_aprovada", p_detail: { to: "antigo@x.com" } }]);
  assert.equal(x.state.issued.p_hash, createHash("sha256").update("ab".repeat(32)).digest("hex"));
  assert.equal(JSON.stringify(x.mails).includes("agua viva"), false);
  assert.equal(x.mails.some((m) => m.to === "antigo@x.com"), false);
  assert.equal(x.state.marked.length, 4);
});

test("fila: e-mail que falha não é marcado como enviado (tenta de novo depois)", async () => {
  const x = harness({ mailFails: true, state: { due: [{ id: "r1", kind: "decisao", contact_email: "a@b.com", decision: "recusado" }] } });
  await x.rec.handle({ method: "POST", headers: h({ "x-recovery-secret": "segredo-do-cron-com-mais-de-20" }), body: { action: "process_queue" }, ip: "" });
  assert.equal(x.state.marked.length, 0);
});

test("confirmação: link válido troca o e-mail, queima o código e avisa o antigo", async () => {
  const token = "ab".repeat(32);
  const x = harness({ state: { lookup: [{ id: "r4", user_id: casa.user_id, new_email: "novo@exemplo.com" }] } });
  const r = await x.rec.handle({ method: "POST", headers: h(), body: { action: "confirm", token }, ip: "198.51.100.5" });
  assert.equal(r.status, 200); assert.deepEqual(x.state.updated, [[casa.user_id, "novo@exemplo.com"]]); assert.deepEqual(x.state.burned, ["r4"]);
  assert.equal(x.calls.find((c) => c[0] === "recovery_confirm_lookup")[1].p_hash, createHash("sha256").update(token).digest("hex"), "só o hash vai ao banco");
  assert.deepEqual(x.state.pushed, [{ p_user: casa.user_id, p_kind: "email_alterado", p_detail: { to: "antigo@x.com" } }]);
});

test("confirmação: link inválido, expirado, adulterado ou repetido não faz nada", async () => {
  for (const token of ["", "zz", "ab".repeat(31), "AB".repeat(32) + "x", null, 123]) {
    const x = harness(); const r = await x.rec.handle({ method: "POST", headers: h(), body: { action: "confirm", token }, ip: "1.2.3.4" }); assert.equal(r.status, 400); assert.equal(x.state.updated.length, 0); }
  const x = harness({ state: { lookup: [] } }); const r = await x.rec.handle({ method: "POST", headers: h(), body: { action: "confirm", token: "cd".repeat(32) }, ip: "1.2.3.4" });
  assert.equal(r.status, 400); assert.equal(x.state.updated.length, 0);
});

test("confirmação: falha ao trocar não queima o código nem avisa; limite por IP trava força bruta", async () => {
  const x = harness({ updateFails: true, state: { lookup: [{ id: "r4", user_id: casa.user_id, new_email: "novo@exemplo.com" }] } });
  const r = await x.rec.handle({ method: "POST", headers: h(), body: { action: "confirm", token: "ab".repeat(32) }, ip: "9.9.9.9" });
  assert.equal(r.status, 409); assert.equal(x.state.burned.length, 0); assert.equal(x.mails.length, 0);
  const y = harness(); let last;
  for (let i = 0; i < 25; i++) last = await y.rec.handle({ method: "POST", headers: h(), body: { action: "confirm", token: "ef".repeat(32) }, ip: "8.8.8.8" });
  assert.equal(last.status, 429);
});

test("segunda rodada: devolve só o que a própria pessoa informou, exigindo código do pedido e o mesmo e-mail", async () => {
  const parent = "33333333-3333-4333-8333-333333333333";
  const x = harness({ state: { info: { claimed: { type: "cliente", name: "Joao" }, answers: { plan: "" } } } });
  const r = await x.rec.handle({ method: "POST", headers: h(), body: { action: "round2_info", parent_id: parent, contact_email: "Novo@Exemplo.com" }, ip: "5.5.5.5" });
  assert.equal(r.status, 200); assert.equal(r.body.claimed.name, "Joao");
  assert.deepEqual(x.state.infoArgs, { p_parent: parent, p_key: "novo@exemplo.com" });
  const y = harness(); // banco não achou (código errado, e-mail diferente ou já usado)
  assert.equal((await y.rec.handle({ method: "POST", headers: h(), body: { action: "round2_info", parent_id: parent, contact_email: "outro@exemplo.com" }, ip: "5.5.5.5" })).status, 400);
  for (const body of [{ action: "round2_info" }, { action: "round2_info", parent_id: "x", contact_email: "a@b.com" }, { action: "round2_info", parent_id: parent, contact_email: "nao-e-email" }])
    assert.equal((await harness().rec.handle({ method: "POST", headers: h(), body, ip: "" })).status, 400);
  const z = harness({ state: { info: { claimed: {}, answers: {} } } }); let last;
  for (let i = 0; i < 25; i++) last = await z.rec.handle({ method: "POST", headers: h(), body: { action: "round2_info", parent_id: parent, contact_email: "a@b.com" }, ip: "7.7.7.7" });
  assert.equal(last.status, 429);
});

test("e-mail da segunda rodada orienta o que lembrar, sem dizer o que falhou", async () => {
  const x = harness({ state: { due: [{ id: "r3", kind: "decisao", contact_email: "t@exemplo.com", decision: "segunda_rodada", round: 1 }] } });
  await x.rec.handle({ method: "POST", headers: h({ "x-recovery-secret": "segredo-do-cron-com-mais-de-20" }), body: { action: "process_queue" }, ip: "" });
  const m = x.mails[0]; assert.match(m.text, /destacadas/); assert.match(m.text, /última compra/);
  assert.doesNotMatch(m.text, /errou|incorret|não confere/i); assert.match(m.link, /#r=r3$/);
});
