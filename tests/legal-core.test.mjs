import test from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_DOCS, CONSENT_DOCS, LEGAL_VERSION } from "../src/lib/legalCore.js";

test("todo documento de aceite tem texto e links", () => {
  for (const [key, doc] of Object.entries(CONSENT_DOCS)) {
    assert.ok(doc.text.length > 80, key);
    assert.ok(doc.links.length > 0, key);
  }
});

test("checkout exige o aceite único dos termos do cliente mais os dados sensíveis, e há versão", () => {
  assert.deepEqual(CHECKOUT_DOCS.ritual, ["termos_cliente", "dados_sensiveis"]);
  assert.deepEqual(CHECKOUT_DOCS.servico, ["termos_cliente", "dados_sensiveis"]);
  assert.match(LEGAL_VERSION, /rascunho|^\d{4}/);
});

test("os termos do cliente citam cancelamento e reembolso, e levam aos regulamentos", () => {
  assert.match(CONSENT_DOCS.termos_cliente.text, /cancelamento e reembolso/i);
  assert.ok(CONSENT_DOCS.termos_cliente.links.includes("termos-do-cliente"));
});

test("os termos da casa refletem o Stripe: sem retenção de 72h e com as comissões vigentes", () => {
  const t = CONSENT_DOCS.termos_casa.text;
  assert.doesNotMatch(t, /72/);
  assert.match(t, /15%/);
  assert.match(t, /4%/);
});
