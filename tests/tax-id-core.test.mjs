import test from "node:test";
import assert from "node:assert/strict";
import { taxIdKind, formatTaxIdInput, onlyDigits, readTaxIdStatus } from "../src/lib/taxIdCore.js";

test("CPF e CNPJ válidos, com ou sem pontuação", () => {
  assert.equal(taxIdKind("52998224725"), "cpf");
  assert.equal(taxIdKind("529.982.247-25"), "cpf");
  assert.equal(taxIdKind("11222333000181"), "cnpj");
  assert.equal(taxIdKind("11.222.333/0001-81"), "cnpj");
});

test("dígito errado, repetidos, tamanho errado e lixo são recusados", () => {
  for (const bad of ["52998224726", "11222333000182", "11111111111", "00000000000000", "123", "", null, undefined, "abc", "5299822472", "529982247251", 5, {}]) {
    assert.equal(taxIdKind(bad), null, String(bad));
  }
});

test("máscara progressiva de CPF e de CNPJ", () => {
  assert.equal(formatTaxIdInput("529"), "529");
  assert.equal(formatTaxIdInput("5299"), "529.9");
  assert.equal(formatTaxIdInput("52998224725"), "529.982.247-25");
  assert.equal(formatTaxIdInput("529982247251"), "52.998.224/7251");
  assert.equal(formatTaxIdInput("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatTaxIdInput("112223330001819999"), "11.222.333/0001-81", "corta no tamanho máximo");
  assert.equal(formatTaxIdInput("ab1c2"), "12");
  assert.equal(onlyDigits("11.222.333/0001-81"), "11222333000181");
});

test("o formato digitado volta a ser válido", () => {
  assert.equal(taxIdKind(formatTaxIdInput("52998224725")), "cpf");
  assert.equal(taxIdKind(formatTaxIdInput("11222333000181")), "cnpj");
});

test("status do banco: só aceita máscara no formato esperado; lixo vira 'sem documento'", () => {
  const ok = readTaxIdStatus({ has_house: true, set: true, kind: "cpf", masked: "***.***.***-25", subscribed: true });
  assert.deepEqual(ok, { hasHouse: true, set: true, kind: "cpf", masked: "***.***.***-25", subscribed: true });
  assert.equal(readTaxIdStatus({ set: true, masked: "**.***.***/****-81" }).masked, "**.***.***/****-81");
  assert.equal(readTaxIdStatus({ set: true, masked: "529.982.247-25" }).masked, null, "número completo nunca é exibido, mesmo que viesse");
  assert.equal(readTaxIdStatus({ masked: "<script>" }).masked, null);
  for (const bad of [null, undefined, "x", 5, []]) assert.equal(readTaxIdStatus(bad).set, false);
});
