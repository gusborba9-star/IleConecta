import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, emailSim, emailKey, textSim, identificationScore, norm } from "../supabase/functions/account-recovery/engine.js";

const casa = {
  user_id: "u-casa", type: "casa", name: "Maria Silva", house_name: "Casa Luz do Caminho", emails: ["maria.silva@gmail.com", "msilva@oldmail.com"],
  city: "Salvador", plan: "profissional", created_at: "2026-03-15T10:00:00Z", last_activity_at: "2026-11-20T10:00:00Z",
  tx: { count: 5, last_kind: "ritual", last_value_cents: 19900, last_at: "2026-10-10T10:00:00Z" }, assistant_name: "Lara", uses_assistant: true, members_count: 42, has_staff: true,
};
const cliente = { user_id: "u-cli", type: "cliente", name: "João Pereira", house_name: null, emails: ["joao.p@gmail.com"], city: "Recife", plan: null, created_at: "2026-06-01T00:00:00Z", last_activity_at: "2026-11-01T00:00:00Z",
  tx: { count: 2, last_kind: "jogo", last_value_cents: 20000, last_at: "2026-09-20T00:00:00Z" }, top_house_names: ["Casa Luz do Caminho", "Casa das Águas"], members_count: 0 };
const cand = (facts, wordState = "ok") => ({ facts, wordState });
const legitClaim = { type: "casa", name: "maria silva", old_email: "maria.silva@gmail.com", city: "salvador" };
const legitAnswers = { signup_month: "2026-03", last_access_month: "2026-11", plan: "profissional", had_tx: "sim", last_tx_kind: "ritual", last_tx_value: "199,00", last_tx_month: "2026-10", uses_assistant: "sim", assistant_name: "lara", has_members: "sim", members_count: "40", has_staff: "sim" };

test("quem sabe os dados da conta recebe 'aprovar'", () => {
  const r = evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa)]);
  assert.equal(r.recommendation, "aprovar");
  assert.equal(r.lane, "normal");
  assert.equal(r.best.user_id, "u-casa");
  assert.ok(r.best.strong_hits >= 2 && r.best.ratio >= 0.75);
});

test("quem só tem dados públicos (nome, casa, cidade) e chuta o plano é recusado", () => {
  const r = evaluate({ claimed: { type: "casa", name: "Casa Luz do Caminho", old_email: "", city: "Salvador" }, answers: { plan: "premium", had_tx: "sim", uses_assistant: "sim" } }, [cand(casa, "not_answered")]);
  assert.notEqual(r.recommendation, "aprovar");
  assert.equal(r.best?.strong_hits ?? 0, 0);
});

test("e-mail aproximado com máscara fica 'parecido' e não vale como prova forte sozinho", () => {
  assert.ok(emailSim("ma***@gmail.com", "maria.silva@gmail.com") >= 0.6 && emailSim("ma***@gmail.com", "maria.silva@gmail.com") < 0.8);
  assert.equal(emailSim("maria.silva@gmail.com", "maria.silva@gmail.com"), 1);
  assert.equal(emailSim("Maria.Silva+x@GMAIL.com", "mariasilva@gmail.com"), 1, "gmail: sem ponto e sem +apelido");
  assert.ok(emailSim("outra.pessoa@gmail.com", "maria.silva@gmail.com") < 0.6);
  assert.equal(emailSim("", "a@b.com"), 0);
});

test("e-mail anterior vinculado também conta", () => {
  const r = evaluate({ claimed: { ...legitClaim, old_email: "msilva@oldmail.com" }, answers: legitAnswers }, [cand(casa)]);
  assert.equal(r.recommendation, "aprovar");
});

test("tolera erro de digitação, acento e maiúscula no nome", () => {
  assert.ok(textSim("Maria Sílva", "maria silva") > 0.85);
  assert.ok(textSim("Mria Silva", "Maria Silva") > 0.8);
  assert.ok(textSim("Carlos", "Maria Silva") < 0.3);
  assert.equal(norm("  Ação  Já! "), "acao ja");
});

test("responder 'não lembro' em quase tudo dá 'evidência insuficiente', sem penalizar", () => {
  const r = evaluate({ claimed: { type: "casa", name: "maria silva", old_email: "nao_lembro", city: "nao_lembro" }, answers: { plan: "nao_lembro", signup_month: "", had_tx: "nao_lembro" } }, [cand(casa)]);
  assert.equal(r.recommendation, "insuficiente");
  assert.ok(r.reasons.some((x) => x.result === "nao_respondeu"));
});

test("palavra de segurança errada impede 'aprovar', mesmo com o resto certo", () => {
  const r = evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa, "wrong")]);
  assert.notEqual(r.recommendation, "aprovar");
  const r2 = evaluate({ claimed: legitClaim, answers: legitAnswers, round: 2 }, [cand(casa, "wrong")]);
  assert.equal(r2.recommendation, "recusar");
});

test("palavra certa soma como prova forte; conta sem palavra cadastrada não penaliza", () => {
  const withWord = evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa, "ok")]);
  const without = evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa, "none_set")]);
  assert.ok(withWord.reasons.find((x) => x.code === "word").result === "confere");
  assert.equal(without.reasons.find((x) => x.code === "word").result, "nao_respondeu");
  assert.equal(without.recommendation, "aprovar");
});

test("duas contas parecidas: segunda rodada na primeira vez, recusa na segunda", () => {
  const gemea = { ...casa, user_id: "u-gemea", emails: ["maria.silva2@gmail.com"], name: "Maria Silva" };
  const a = evaluate({ claimed: { ...legitClaim, old_email: "maria.silva@gmail.com" }, answers: legitAnswers }, [cand(casa), cand({ ...gemea, emails: ["maria.silva@gmail.com"] })]);
  assert.equal(a.recommendation, "segunda_rodada");
  const b = evaluate({ claimed: legitClaim, answers: legitAnswers, round: 2 }, [cand(casa), cand({ ...gemea, emails: ["maria.silva@gmail.com"] })]);
  assert.equal(b.recommendation, "recusar");
});

test("nenhuma conta combina: fila 'sem conta encontrada' com recusa já calculada", () => {
  const r = evaluate({ claimed: { type: "casa", name: "Fulano Inexistente", old_email: "zzz@nada.com", city: "Lugar Nenhum" }, answers: legitAnswers }, [cand(casa)]);
  assert.equal(r.lane, "sem_conta");
  assert.equal(r.recommendation, "recusar");
  assert.deepEqual(r.candidates, []);
});

test("tipo diferente (cliente x casa) elimina a candidata", () => {
  assert.equal(identificationScore({ type: "cliente", name: "Maria Silva", old_email: "maria.silva@gmail.com", city: "Salvador" }, casa), 0);
});

test("tolerância de datas: mês certo e vizinho valem, mês distante não", () => {
  const base = { claimed: legitClaim, answers: { ...legitAnswers } };
  const sig = (m) => evaluate({ ...base, answers: { ...legitAnswers, signup_month: m } }, [cand(casa)]).reasons.find((x) => x.code === "signup").result;
  assert.equal(sig("2026-03"), "confere");
  assert.equal(sig("2026-04"), "confere");
  assert.equal(sig("2026-08"), "nao_confere");
});

test("dizer que nunca transacionou quando transacionou é contradição forte", () => {
  const r = evaluate({ claimed: legitClaim, answers: { ...legitAnswers, had_tx: "nao", last_tx_kind: "", last_tx_value: "", last_tx_month: "" } }, [cand(casa)]);
  assert.equal(r.reasons.find((x) => x.code === "last_tx").result, "nao_confere");
  assert.notEqual(r.recommendation, "aprovar");
});

test("cliente: casas com quem mais conversou e transação batem", () => {
  const r = evaluate({
    claimed: { type: "cliente", name: "Joao Pereira", old_email: "joao.p@gmail.com", city: "Recife" },
    answers: { signup_month: "2026-06", last_access_month: "2026-11", had_tx: "sim", last_tx_kind: "jogo", last_tx_value: "200", last_tx_month: "2026-09", top_houses: ["casa luz do caminho", "Casa das Aguas"] },
  }, [cand(cliente)]);
  assert.equal(r.recommendation, "aprovar");
});

test("a saída nunca contém dado real da conta (e-mail, cidade, nome da casa, assistente)", () => {
  const r = evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa)]);
  const txt = JSON.stringify(r).toLowerCase();
  for (const secret of ["maria.silva@gmail.com", "msilva@oldmail.com", "salvador", "luz do caminho", "lara", "19900", "199"]) assert.equal(txt.includes(secret), false, secret);
});

test("mesma entrada, mesma saída (determinístico) e entradas hostis não quebram", () => {
  const a = JSON.stringify(evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa)]));
  assert.equal(a, JSON.stringify(evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa)])));
  for (const bad of [{}, { claimed: null }, { claimed: { name: 123, old_email: {}, city: [] }, answers: { top_houses: "x", members_count: {}, last_tx_value: NaN } }]) {
    assert.doesNotThrow(() => evaluate({ claimed: bad.claimed ?? {}, answers: bad.answers ?? {} }, [cand(casa)]));
  }
  assert.doesNotThrow(() => evaluate({ claimed: legitClaim, answers: legitAnswers }, []));
});

test("emailKey espelha a regra do banco", () => {
  assert.equal(emailKey("A.B.C+loja@GoogleMail.com"), "abc@gmail.com");
  assert.equal(emailKey("a.b+x@empresa.com.br"), "a.b@empresa.com.br");
  assert.equal(emailKey("sem-arroba"), "");
});

test("pesos e limites podem ser ajustados pelo dono sem mexer no código", () => {
  const r = evaluate({ claimed: legitClaim, answers: legitAnswers }, [cand(casa)], { approve: { minStrongHits: 99 } });
  assert.notEqual(r.recommendation, "aprovar");
});
