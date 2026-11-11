import test from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_DOCS, CONSENT_DOCS, LEGAL_VERSION, REQUIRED_DOCS, OPTIONAL_DOCS, consentStatus, gateDocs } from "../src/lib/legalCore.js";

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


const row = (doc_key, doc_version, accepted_at) => ({ doc_key, doc_version, accepted_at });

test("aceite único: os Termos são obrigatórios; dados sensíveis vêm junto, mas são opcionais", () => {
  assert.deepEqual(REQUIRED_DOCS.casa, ["termos_casa"]);
  assert.deepEqual(REQUIRED_DOCS.cliente, ["termos_cliente"]);
  assert.deepEqual(OPTIONAL_DOCS.cliente, ["dados_sensiveis"]);
  assert.deepEqual(OPTIONAL_DOCS.casa, []);
});

test("aceite único: conta nova vê a tela; quem já aceitou na versão vigente não vê", () => {
  assert.deepEqual(gateDocs("personal", [], LEGAL_VERSION), { required: ["termos_cliente"], optional: ["dados_sensiveis"] });
  assert.deepEqual(gateDocs("personal", null, LEGAL_VERSION), { required: ["termos_cliente"], optional: ["dados_sensiveis"] });
  assert.deepEqual(gateDocs("commercial", [], LEGAL_VERSION), { required: ["termos_casa"], optional: [] });
  const ok = [row("termos_cliente", LEGAL_VERSION, "2026-11-01T10:00:00Z")];
  assert.deepEqual(gateDocs("personal", ok, LEGAL_VERSION), { required: [], optional: [] });
  assert.deepEqual(gateDocs("commercial", [row("termos_casa", LEGAL_VERSION, "2026-11-01T10:00:00Z")], LEGAL_VERSION), { required: [], optional: [] });
});

test("aceite único: dados sensíveis sozinhos nunca abrem a tela (consentimento livre; é pedido só ao contratar)", () => {
  const sóTermos = [row("termos_cliente", LEGAL_VERSION, "2026-11-01T10:00:00Z")];
  assert.deepEqual(gateDocs("personal", sóTermos, LEGAL_VERSION).required, []);
  assert.equal(consentStatus(sóTermos, "dados_sensiveis", LEGAL_VERSION).status, "never");
});

test("aceite único: versão nova pede de novo uma vez; dados sensíveis já aceitos não são pedidos de novo na mesma tela", () => {
  const old = [row("termos_cliente", "antiga", "2026-10-01T10:00:00Z"), row("dados_sensiveis", LEGAL_VERSION, "2026-11-01T10:00:00Z")];
  assert.deepEqual(gateDocs("personal", old, LEGAL_VERSION), { required: ["termos_cliente"], optional: [] });
  assert.equal(consentStatus(old, "termos_cliente", LEGAL_VERSION).status, "old");
});

test("aceite único: aceite de um documento não vale por outro, nem os antigos por compra", () => {
  const legacy = [row("checkout_servico", LEGAL_VERSION, "2026-11-01T10:00:00Z"), row("termos_casa", LEGAL_VERSION, "2026-11-01T10:00:00Z")];
  assert.deepEqual(gateDocs("personal", legacy, LEGAL_VERSION).required, ["termos_cliente"]);
});

test("aceite único: quem retirou dados sensíveis não é cobrado de novo na entrada; aceitar de novo volta a valer", () => {
  const withdrawn = [
    row("termos_cliente", LEGAL_VERSION, "2026-11-01T10:00:00Z"),
    row("dados_sensiveis", LEGAL_VERSION, "2026-11-01T10:00:00Z"),
    row("dados_sensiveis_retirada", LEGAL_VERSION, "2026-11-05T10:00:00Z"),
  ];
  assert.equal(consentStatus(withdrawn, "dados_sensiveis", LEGAL_VERSION).status, "withdrawn");
  assert.deepEqual(gateDocs("personal", withdrawn, LEGAL_VERSION), { required: [], optional: [] });
  const again = [...withdrawn, row("dados_sensiveis", LEGAL_VERSION, "2026-11-09T10:00:00Z")];
  assert.equal(consentStatus(again, "dados_sensiveis", LEGAL_VERSION).status, "ok");
  assert.equal(consentStatus([...again].reverse(), "dados_sensiveis", LEGAL_VERSION).status, "ok");
});

test("aceite único: registros estranhos não derrubam a conta", () => {
  assert.deepEqual(gateDocs("personal", [null, undefined, {}, { doc_key: 5 }], LEGAL_VERSION).required, ["termos_cliente"]);
});
