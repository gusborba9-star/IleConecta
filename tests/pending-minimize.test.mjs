import test from "node:test";
import assert from "node:assert/strict";
import { shownPriority, isCritical, bubbleCount, badgeText, bubbleLabel, readBubble, writeBubble } from "../src/lib/pendingMinimizeCore.js";

test("assistente sem respostas: quem nunca comprou pacote vê 'normal'; quem comprou vê a prioridade real", () => {
  const a = { kind: "assistente_sem_respostas", priority: "alta" };
  assert.equal(shownPriority(a, { hasCredits: false }), "normal");
  assert.equal(shownPriority(a, { hasCredits: true }), "alta");
  assert.equal(shownPriority({ kind: "fatura", priority: "alta" }, { hasCredits: false }), "alta");
  assert.equal(shownPriority(null), "normal");
});
test("o número da faixa: inteiro até 99, '99+' depois, nunca negativo", () => {
  assert.deepEqual([0, 1, 2, 5, 8, 9, 10, 25, 99, 100, 250, -3, NaN].map(badgeText), ["0", "1", "2", "5", "8", "9", "10", "25", "99", "99+", "99+", "0", "0"]);
});
test("contagem: total da central; se só há faturas a pagar, conta as faturas", () => {
  assert.equal(bubbleCount({ total: 4, toPay: { count: 1 } }), 4);
  assert.equal(bubbleCount({ total: 0, toPay: { count: 2 } }), 2);
  assert.equal(bubbleCount(null), 0);
  assert.equal(bubbleCount({ total: "x" }), 0);
});
test("texto para leitor de tela cita quantas e quantas vencidas", () => {
  assert.equal(bubbleLabel(1), "1 pendente");
  assert.equal(bubbleLabel(12, 2), "12 pendentes, 2 vencidas");
});
test("críticas ficam à mostra: vencida, suporte, moderação e prioridade alta; o aviso da assistente de quem nunca comprou pacote não", () => {
  assert.equal(isCritical({ kind: "pedido_para_iniciar", priority: "normal", overdue: true }), true);
  assert.equal(isCritical({ kind: "suporte", priority: "normal" }), true);
  assert.equal(isCritical({ kind: "moderacao", priority: "normal" }), true);
  assert.equal(isCritical({ kind: "fatura", priority: "alta" }), true);
  assert.equal(isCritical({ kind: "pedido_para_iniciar", priority: "normal" }), false);
  assert.equal(isCritical({ kind: "assistente_sem_respostas", priority: "alta" }, { hasCredits: false }), false);
  assert.equal(isCritical({ kind: "assistente_sem_respostas", priority: "alta" }, { hasCredits: true }), true);
  assert.equal(isCritical(null), false);
});
test("estado guardado por aparelho; lixo no armazenamento vira 'aberto'", () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(readBubble("u1", st), { minimized: false });
  writeBubble("u1", { minimized: true }, st);
  assert.deepEqual(readBubble("u1", st), { minimized: true });
  assert.deepEqual(readBubble("u2", st), { minimized: false });
  mem.set("ic:pend-faixa:u3", "{lixo");
  assert.deepEqual(readBubble("u3", st), { minimized: false });
  assert.doesNotThrow(() => writeBubble("u1", { minimized: true }, { setItem() { throw new Error("cheio"); } }));
});
