import test from "node:test";
import assert from "node:assert/strict";
import { applyMoneyEdit, centsToMasked, maskMoney, maskedToCents } from "../src/lib/moneyMask.js";
import { parsePriceToCents } from "../src/lib/servicesCore.js";

test("digitar 10000 mostra 100,00 e valores pequenos ganham zeros", () => {
  assert.equal(maskMoney("10000"), "100,00");
  assert.equal(maskMoney("5"), "0,05");
  assert.equal(maskMoney("50"), "0,50");
  assert.equal(maskMoney("123456"), "1.234,56");
  assert.equal(maskMoney("1234567"), "12.345,67");
  assert.equal(maskMoney(""), "");
  assert.equal(maskMoney("abc"), "");
  assert.equal(maskMoney("0000"), "");
});

test("digitação passo a passo, como no celular", () => {
  let v = "";
  for (const ch of ["1", "0", "0", "0", "0"]) v = applyMoneyEdit(v, v + ch);
  assert.equal(v, "100,00");
  v = applyMoneyEdit(v, v + "5");
  assert.equal(v, "1.000,05");
});

test("apagar funciona, inclusive quando só a vírgula some", () => {
  assert.equal(applyMoneyEdit("100,00", "100,0"), "10,00");
  assert.equal(applyMoneyEdit("100,00", "10000"), "10,00"); // vírgula apagada: tira o último dígito
  assert.equal(applyMoneyEdit("1.000,05", "1.000,0"), "100,00");
  assert.equal(applyMoneyEdit("0,05", "0,0"), "");
  assert.equal(applyMoneyEdit("0,05", ""), "");
});

test("colar um valor já formatado ou com R$ funciona e há teto de dígitos", () => {
  assert.equal(applyMoneyEdit("", "R$ 1.200,50"), "1.200,50");
  assert.equal(maskMoney("12345678901234"), "1.234.567,89");
});

test("o texto da máscara é entendido pelo cálculo de preço existente", () => {
  for (const cents of [1, 99, 10000, 19990, 120000, 1234567]) {
    assert.equal(parsePriceToCents(centsToMasked(cents)), cents);
  }
  assert.equal(centsToMasked(10000), "100,00");
  assert.equal(centsToMasked(0), "");
  assert.equal(centsToMasked(null), "");
  assert.equal(maskedToCents("1.200,50"), 120050);
  assert.equal(maskedToCents(""), null);
});
