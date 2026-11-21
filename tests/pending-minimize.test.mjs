import test from "node:test";
import assert from "node:assert/strict";
import { canMinimize, minimizeKey, shownPriority, readMinimized, writeMinimized } from "../src/lib/pendingMinimizeCore.js";

const ass = (priority) => ({ kind: "assistente_sem_respostas", refId: "h1", priority });
test("assistente sem respostas: quem nunca comprou pacote sempre pode minimizar", () => {
  assert.equal(canMinimize(ass("alta"), { hasCredits: false }), true);
  assert.equal(canMinimize(ass("normal"), { hasCredits: false }), true);
});
test("assistente sem respostas: quem já comprou só minimiza o 'quase sem'; acabou fica aberto", () => {
  assert.equal(canMinimize(ass("normal"), { hasCredits: true }), true);
  assert.equal(canMinimize(ass("alta"), { hasCredits: true }), false);
});
test("nada que envolva cliente, dinheiro, moderação ou suporte pode ser minimizado", () => {
  for (const kind of ["conversa_sem_resposta", "pedido_para_iniciar", "reembolso_da_casa", "mensalidade_vencida", "fatura", "moderacao", "suporte", "avaliacao_sem_resposta", "atendimento_passou", "cadastro_cpf_cnpj", "conta_de_recebimento", "assunto_da_assistente"]) {
    assert.equal(canMinimize({ kind, refId: "x", priority: "normal" }, { hasCredits: false }), false, kind);
  }
  assert.equal(canMinimize({ kind: "cartao_vencendo", refId: "c", priority: "normal", overdue: true }), false);
  assert.equal(canMinimize({ kind: "cartao_vencendo", refId: "c", priority: "normal" }), true);
  assert.equal(canMinimize(null), false);
});
test("a chave muda quando a prioridade sobe: minimizado reabre sozinho", () => {
  assert.notEqual(minimizeKey(ass("normal")), minimizeKey(ass("alta")));
});
test("prioridade mostrada: sem pacote comprado a assistente é 'normal'", () => {
  assert.equal(shownPriority(ass("alta"), { hasCredits: false }), "normal");
  assert.equal(shownPriority(ass("alta"), { hasCredits: true }), "alta");
  assert.equal(shownPriority({ kind: "fatura", priority: "alta" }, { hasCredits: false }), "alta");
});
test("memória do aparelho: guarda só o que ainda existe e aguenta dado estranho", () => {
  const mem = {}; const st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  writeMinimized("u1", new Set(["a", "b"]), ["a"], st);
  assert.deepEqual([...readMinimized("u1", st)], ["a"]);
  mem["ic:pend-min:u2"] = "{lixo";
  assert.equal(readMinimized("u2", st).size, 0);
  mem["ic:pend-min:u3"] = JSON.stringify([1, "ok", null]);
  assert.deepEqual([...readMinimized("u3", st)], ["ok"]);
  assert.equal(readMinimized("u4", { getItem: () => { throw new Error("x"); } }).size, 0);
});
