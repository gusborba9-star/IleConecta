import test from "node:test";
import assert from "node:assert/strict";
import { shownPriority, bubbleCount, badgeText, bubbleLabel, readBubble, writeBubble, shouldReopen } from "../src/lib/pendingMinimizeCore.js";

test("assistente sem respostas: quem nunca comprou pacote vê 'normal'; quem comprou vê a prioridade real", () => {
  const a = { kind: "assistente_sem_respostas", priority: "alta" };
  assert.equal(shownPriority(a, { hasCredits: false }), "normal");
  assert.equal(shownPriority(a, { hasCredits: true }), "alta");
  assert.equal(shownPriority({ kind: "fatura", priority: "alta" }, { hasCredits: false }), "alta");
  assert.equal(shownPriority(null), "normal");
});
test("o número do balão: 1 a 9 como é, '9+' a partir de 10, nunca negativo", () => {
  assert.deepEqual([0, 1, 2, 5, 8, 9, 10, 25, -3, NaN].map(badgeText), ["0", "1", "2", "5", "8", "9", "9+", "9+", "0", "0"]);
});
test("contagem: total da central; se só há faturas a pagar, conta as faturas", () => {
  assert.equal(bubbleCount({ total: 4, toPay: { count: 1 } }), 4);
  assert.equal(bubbleCount({ total: 0, toPay: { count: 2 } }), 2);
  assert.equal(bubbleCount(null), 0);
  assert.equal(bubbleCount({ total: "x" }), 0);
});
test("texto para leitor de tela cita quantas e quantas vencidas", () => {
  assert.equal(bubbleLabel(1), "Abrir a central de pendências: 1 pendente");
  assert.equal(bubbleLabel(12, 2), "Abrir a central de pendências: 12 pendentes, 2 vencidas");
});
test("estado guardado por aparelho; lixo no armazenamento vira 'aberto'", () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(readBubble("u1", st), { minimized: false, overdue: 0 });
  writeBubble("u1", { minimized: true, overdue: 2 }, st);
  assert.deepEqual(readBubble("u1", st), { minimized: true, overdue: 2 });
  assert.deepEqual(readBubble("u2", st), { minimized: false, overdue: 0 });
  mem.set("ic:pend-bubble:u3", "{lixo");
  assert.deepEqual(readBubble("u3", st), { minimized: false, overdue: 0 });
  assert.doesNotThrow(() => writeBubble("u1", { minimized: true, overdue: 1 }, { setItem() { throw new Error("cheio"); } }));
});
test("abre sozinho só quando surge vencida nova", () => {
  assert.equal(shouldReopen({ minimized: true, overdue: 1 }, 1), false);
  assert.equal(shouldReopen({ minimized: true, overdue: 1 }, 2), true);
  assert.equal(shouldReopen({ minimized: false, overdue: 0 }, 5), false);
});
