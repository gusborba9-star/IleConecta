import test from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_LIMIT,
  MAX_USER_CHARS,
  USER_RATE,
  allowedDiscountPercent,
  buildSystemPrompt,
  canSell,
  checkGate,
  cleanReply,
  cleanUserText,
  formatCents,
  monthStartISO,
  toChatMessages,
} from "../supabase/functions/assistant-chat/logic.js";

const assistantOn = {
  enabled: true,
  display_name: "Dandara",
  instructions: "Tom acolhedor.",
  business_hours: { seg: "9h-18h", dom: "  " },
  can_sell: true,
  can_discount: true,
  max_discount_percent: 15,
};
const house = { name: "Ilê Axé", category: "Candomblé Ketu" };
const base = { house, assistant: assistantOn, services: [], events: [] };

test("plano base não tem assistente; cota e limite por usuário bloqueiam", () => {
  const ok = { plan: "maximo", assistant: assistantOn, usedThisMonth: 0, usedByUserInWindow: 0 };
  assert.equal(checkGate(ok), null);
  assert.equal(checkGate({ ...ok, plan: "base" }), "plano_sem_assistente");
  assert.equal(checkGate({ ...ok, plan: "desconhecido" }), "plano_sem_assistente");
  assert.equal(checkGate({ ...ok, assistant: { ...assistantOn, enabled: false } }), "assistente_desativada");
  assert.equal(checkGate({ ...ok, assistant: null }), "assistente_desativada");
  assert.equal(checkGate({ ...ok, plan: "intermediario", usedThisMonth: 300 }), "cota_mensal");
  assert.equal(checkGate({ ...ok, plan: "intermediario", usedThisMonth: 299 }), null);
  assert.equal(checkGate({ ...ok, usedByUserInWindow: USER_RATE.maxReplies }), "muitas_mensagens");
});

test("desconto e venda só no plano máximo e dentro do limite da casa", () => {
  assert.equal(allowedDiscountPercent("maximo", assistantOn), 15);
  assert.equal(allowedDiscountPercent("intermediario", assistantOn), 0);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, can_discount: false }), 0);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, max_discount_percent: 250 }), 100);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, max_discount_percent: -5 }), 0);
  assert.equal(allowedDiscountPercent("maximo", { ...assistantOn, max_discount_percent: "abc" }), 0);
  assert.equal(canSell("maximo", assistantOn), true);
  assert.equal(canSell("intermediario", assistantOn), false);
  assert.equal(canSell("maximo", { ...assistantOn, can_sell: false }), false);
});

test("limpa a mensagem do cliente", () => {
  assert.equal(cleanUserText("  oi\u0000 tudo bem?  "), "oi tudo bem?");
  assert.equal(cleanUserText("   "), "");
  assert.equal(cleanUserText(42), "");
  assert.equal(cleanUserText("a".repeat(MAX_USER_CHARS + 50)).length, MAX_USER_CHARS);
  assert.equal(cleanReply("  olá  "), "olá");
  assert.equal(cleanReply(null), "");
});

test("prompt traz serviços reais com preço exato e as regras de segurança", () => {
  const p = buildSystemPrompt({
    ...base,
    plan: "maximo",
    services: [{ kind: "buzios", title: "Jogo de búzios", description: "Consulta online", price_cents: 12050 }],
    events: [{ title: "Ritual de prosperidade", price_cents: 29900, mode: "hibrido", starts_at: "2026-10-31T20:00:00Z" }],
    now: new Date("2026-10-25T12:00:00Z"),
  });
  assert.match(p, /Jogo de búzios/);
  assert.ok(p.includes(formatCents(12050)));
  assert.ok(p.includes(formatCents(29900)));
  assert.match(p, /2026-10-31/);
  assert.match(p, /segunda: 9h-18h/);
  assert.doesNotMatch(p, /domingo/);
  assert.match(p, /Nunca invente/);
  assert.match(p, /desconto de até 15%/);
  assert.match(p, /nunca por você/);
});

test("sem permissão, o prompt proíbe desconto e venda", () => {
  const p = buildSystemPrompt({ ...base, plan: "intermediario" });
  assert.match(p, /NÃO pode oferecer nem negociar desconto/);
  assert.match(p, /não envie pagamento/);
  assert.doesNotMatch(p, /desconto de até/);
  assert.match(p, /\(nenhum cadastrado\)/);
});

test("formata dinheiro em centavos sem erro de ponto flutuante", () => {
  assert.equal(formatCents(29900).replace(/\s/g, " "), "R$ 299,00");
  assert.equal(formatCents(5).replace(/\s/g, " "), "R$ 0,05");
});

test("histórico: limita, mantém ordem e separa assistente de cliente", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    sender_id: i % 2 ? "dono" : "cliente",
    from_assistant: i % 2 === 1,
    text: `m${i}`,
  }));
  const chat = toChatMessages(history, "dono");
  assert.equal(chat.length, HISTORY_LIMIT);
  assert.equal(chat.at(-1).content, "m19");
  assert.equal(chat.at(-1).role, "assistant");
  assert.equal(chat[0].role, chat[0].content === "m8" ? "user" : "assistant");
  // O dono falando como pessoa (não assistente) é tratado como cliente no histórico.
  assert.equal(toChatMessages([{ sender_id: "dono", from_assistant: false, text: "oi" }], "dono")[0].role, "user");
});

test("cota mensal começa no dia 1 em UTC", () => {
  assert.equal(monthStartISO(new Date("2026-10-25T23:59:00Z")), "2026-10-01T00:00:00.000Z");
});
