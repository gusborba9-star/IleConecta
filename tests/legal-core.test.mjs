import test from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_DOCS, CONSENT_DOCS, LEGAL_VERSION } from "../src/lib/legalCore.js";

test("todo documento de aceite tem texto e links", () => {
  for (const [key, doc] of Object.entries(CONSENT_DOCS)) {
    assert.ok(doc.text.length > 80, key);
    assert.ok(doc.links.length > 0, key);
  }
});

test("checkout exige o aceite certo mais os dados sensíveis, e há versão", () => {
  assert.deepEqual(CHECKOUT_DOCS.ritual, ["checkout_ritual", "dados_sensiveis"]);
  assert.deepEqual(CHECKOUT_DOCS.servico, ["checkout_servico", "dados_sensiveis"]);
  assert.match(LEGAL_VERSION, /rascunho|^\d{4}/);
});

test("os textos de aceite não prometem resultado e citam a regra de reembolso", () => {
  for (const key of ["checkout_ritual", "checkout_servico"]) {
    assert.match(CONSENT_DOCS[key].text, /reembolso/i);
    assert.match(CONSENT_DOCS[key].text, /insatisfação|frustração/i);
  }
});
