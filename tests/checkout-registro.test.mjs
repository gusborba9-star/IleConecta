// Cada compra paga deixa o seu registro (frase junto do botão de pagar, sem caixa nova) e, se o registro falhar, a compra não segue.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const cases = [
  { file: "src/components/rituals/ReserveModal.tsx", doc: "checkout_ritual", next: "reserveSeat(", price: "ritual.priceCents > 0" },
  { file: "src/components/services/ContractModal.tsx", doc: "checkout_servico", next: "createOrder(", price: "service.priceCents > 0" },
];

for (const c of cases) {
  test(`${c.doc}: frase de concordância visível, registro por compra e falha do registro impede a compra`, () => {
    const s = read(c.file);
    assert.match(s, /Ao finalizar o pagamento, você concorda com os/);
    assert.match(s, /to="\/sobre\/termos-do-cliente"/);
    assert.ok(s.includes(`(["${c.doc}"] as CheckoutDocKey[])`), "grava o registro da compra");
    assert.ok(s.includes(`payOn && ${c.price}`), "só em compra paga");
    const record = s.indexOf("recordConsents(toRecord");
    const abort = s.indexOf("if (consentError)", record);
    const create = s.indexOf(c.next, abort);
    assert.ok(record > 0 && abort > record && create > abort, "o registro vem antes de criar a reserva/pedido e aborta se falhar");
    assert.equal((s.match(/<ConsentBox doc="termos_cliente"/g) ?? []).length, 1, "nenhuma caixa nova por compra: só a do primeiro aceite");
  });
}
