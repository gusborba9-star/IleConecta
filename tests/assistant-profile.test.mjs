import test from "node:test";
import assert from "node:assert/strict";
import { HANDOFF_MARK, buildSystemPrompt, extractHandoff, normalizeProfile } from "../supabase/functions/assistant-chat/logic.js";

const assistantOn = { enabled: true, display_name: "Luz", instructions: "", business_hours: {}, can_sell: false, can_discount: false, max_discount_percent: 0 };

test("perfil da casa: normaliza tipos e tamanhos e descarta perguntas incompletas", () => {
  const p = normalizeProfile({
    about: "  Casa   de   axé  ", tone: "xyz", faq: [{ q: "Horário?", a: "19h" }, { q: "sem resposta" }, null, ...Array(20).fill({ q: "a", a: "b" })], extra: "x",
  });
  assert.equal(p.about, "Casa de axé");
  assert.equal(p.tone, "acolhedor");
  assert.equal(p.faq.length, 12);
  assert.equal(p.faq[0].q, "Horário?");
  assert.equal("extra" in p, false);
  assert.deepEqual(normalizeProfile("lixo").faq, []);
});

test("prompt usa o perfil da casa, o tom e a regra de passar para a casa", () => {
  const prompt = buildSystemPrompt({
    house: { name: "Casa Luz" }, plan: "maximo", services: [], events: [],
    assistant: { ...assistantOn, profile: { tradition: "Umbanda", dont: "amarração", tone: "formal", address: "Rua A, 10", faq: [{ q: "Leva o quê?", a: "Roupa branca" }], handoff: "pagamentos" } },
  });
  assert.match(prompt, /Tradição\/linha da casa: Umbanda/);
  assert.match(prompt, /NÃO faz.*amarração/);
  assert.match(prompt, /Rua A, 10/);
  assert.match(prompt, /Leva o quê\? → Resposta da casa: Roupa branca/);
  assert.match(prompt, /formal e respeitoso/);
  assert.ok(prompt.includes(HANDOFF_MARK));
  assert.match(prompt, /188/);
  assert.match(prompt, /tratar de: pagamentos/);
});

test("marcador de repasse é removido do texto e detectado", () => {
  assert.deepEqual(extractHandoff(`Entendo. A casa vai assumir. ${HANDOFF_MARK}`), { handoff: true, text: "Entendo. A casa vai assumir." });
  assert.deepEqual(extractHandoff("Tudo certo."), { handoff: false, text: "Tudo certo." });
  assert.equal(extractHandoff(undefined).text, "");
});

import { CRISIS_NOTE, HANDOFF_NOTE, detectCrisis, finalizeReply } from "../supabase/functions/assistant-chat/logic.js";

test("repasse: o servidor garante o aviso de que a casa assume, mesmo se o modelo esquecer", () => {
  const r = finalizeReply(`Sinto muito pela sua perda. ${HANDOFF_MARK}`, "Perdi minha mãe");
  assert.equal(r.handoff, true);
  assert.ok(r.text.includes(HANDOFF_NOTE));
  assert.ok(!r.text.includes(HANDOFF_MARK));
  const ja = finalizeReply(`A casa vai assumir daqui. ${HANDOFF_MARK}`, "Perdi minha mãe");
  assert.equal(ja.text, "A casa vai assumir daqui.");
  const normal = finalizeReply("A casa fica em Porto Alegre.", "Onde fica?");
  assert.deepEqual(normal, { handoff: false, text: "A casa fica em Porto Alegre." });
  assert.equal(finalizeReply(HANDOFF_MARK, "x").text, HANDOFF_NOTE);
});

test("risco de vida: sempre passa para a casa e traz o CVV, mesmo sem o marcador do modelo", () => {
  assert.equal(detectCrisis("não quero mais viver"), true);
  assert.equal(detectCrisis("vou me matar"), true);
  assert.equal(detectCrisis("qual o valor da consulta?"), false);
  const r = finalizeReply("Estou com você.", "quero morrer");
  assert.equal(r.handoff, true);
  assert.ok(r.text.includes(CRISIS_NOTE));
  assert.ok(r.text.includes(HANDOFF_NOTE));
  const com188 = finalizeReply("Ligue 188 agora. A casa vai assumir.", "quero morrer");
  assert.equal(com188.text.includes(CRISIS_NOTE), false);
});
