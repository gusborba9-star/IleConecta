import test from "node:test";
import assert from "node:assert/strict";
import { REFUND_REASONS, composeReason } from "../src/lib/refundsCore.js";

test("lista de motivos cobre só falhas na entrega", () => {
  assert.deepEqual(REFUND_REASONS.map((r) => r.id), ["nao_realizou", "nao_entregou", "cobranca_indevida", "outro"]);
});

test("monta o motivo com o rótulo e exige detalhes", () => {
  assert.equal(composeReason("nao_realizou", "  A casa não apareceu na transmissão.  "), "[A casa não realizou o ritual ou trabalho] A casa não apareceu na transmissão.");
  assert.equal(composeReason("nao_realizou", "curto"), null);
  assert.equal(composeReason("inexistente", "texto com mais de dez caracteres"), null);
  assert.equal(composeReason("outro", "x".repeat(701)), null);
  // o resultado sempre cabe no limite de 800 do banco
  assert.ok(composeReason("nao_entregou", "x".repeat(700)).length <= 800);
});
