import test from "node:test";
import assert from "node:assert/strict";
import {
  canSendDemoMessage,
  isPromotionActive,
  mergeDemoMessage,
  normalizeDemoEmail,
} from "../src/lib/demoState.js";

test("normaliza e-mail para comparação de cadastro", () => {
  assert.equal(normalizeDemoEmail("  MARI@EXEMPLO.COM "), "mari@exemplo.com");
  assert.equal(normalizeDemoEmail("  "), "");
});

test("considera ativo apenas impulsionamento com expiração futura válida", () => {
  const now = Date.parse("2026-10-25T12:00:00.000Z");
  assert.equal(isPromotionActive("2026-10-25T12:00:01.000Z", now), true);
  assert.equal(isPromotionActive("2026-10-25T11:59:59.000Z", now), false);
  assert.equal(isPromotionActive("data-inválida", now), false);
  assert.equal(isPromotionActive(undefined, now), false);
});

test("rejeita mensagens vazias, autoenvio e destinatário inexistente", () => {
  assert.equal(canSendDemoMessage("u1", "u2", " oi ", true), true);
  assert.equal(canSendDemoMessage("u1", "u2", "   ", true), false);
  assert.equal(canSendDemoMessage("u1", "u1", "oi", true), false);
  assert.equal(canSendDemoMessage("u1", "u2", "oi", false), false);
});

test("acrescenta mensagem à conversa existente sem descartar o histórico", () => {
  const oldMessage = { id: "m1", from: "u1", to: "u2", text: "anterior", createdAt: "2026-10-25T10:00:00.000Z" };
  const nextMessage = { id: "m2", from: "u1", to: "u2", text: "nova", createdAt: "2026-10-25T10:01:00.000Z" };
  const existing = { id: "c1", participantIds: ["u1", "u2"], messages: [oldMessage], updatedAt: oldMessage.createdAt };
  const placeholder = { id: "c-new", participantIds: ["u1", "u2"], messages: [nextMessage], updatedAt: nextMessage.createdAt };

  const result = mergeDemoMessage([existing], nextMessage, placeholder);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].messages.map((message) => message.text), ["anterior", "nova"]);
  assert.equal(result[0].updatedAt, nextMessage.createdAt);
});

test("cria conversa nova quando ainda não existe", () => {
  const message = { id: "m1", from: "u1", to: "u2", text: "oi", createdAt: "2026-10-25T10:00:00.000Z" };
  const conversation = { id: "c1", participantIds: ["u1", "u2"], messages: [message], updatedAt: message.createdAt };
  assert.deepEqual(mergeDemoMessage([], message, conversation), [conversation]);
});
