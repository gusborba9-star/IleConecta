import test from "node:test";
import assert from "node:assert/strict";
import { CARD_MODES, CARD_TEXT_MAX, modeId, toColumn, fromColumn, relLuminance, contrast, sampleBrightness, scrimAlpha, validateDraft, SCRIM_MIN, SCRIM_MAX } from "../src/lib/postCardCore.js";

test("modos: três, na ordem pedida; lixo vira normal; colunas do banco", () => {
  assert.deepEqual(CARD_MODES.map((m) => m.id), ["normal", "total", "parcial"]);
  for (const bad of [null, undefined, 3, {}, "TOTAL", "gigante", ""]) { assert.equal(modeId(bad), "normal"); assert.equal(toColumn(bad), null); assert.equal(fromColumn(bad), "normal"); }
  assert.equal(toColumn("total"), "total"); assert.equal(toColumn("parcial"), "parcial"); assert.equal(toColumn("normal"), null);
  assert.equal(fromColumn("parcial"), "parcial");
});
test("contraste: branco/preto = 21; cinza #767676 sobre branco ≈ 4,54 (referência WCAG)", () => {
  assert.ok(Math.abs(contrast(1, 0) - 21) < 1e-9);
  const g = relLuminance(0x76, 0x76, 0x76);
  assert.ok(Math.abs(contrast(1, g) - 4.54) < 0.02, String(contrast(1, g)));
});
test("brilho do fundo: percentil 90, ignora transparente; vazio ou lixo = pior caso", () => {
  const px = (r, g, b, a = 255) => [r, g, b, a];
  const dark = Array.from({ length: 90 }, () => px(10, 10, 10)).flat(), bright = Array.from({ length: 10 }, () => px(250, 250, 250)).flat();
  assert.ok(sampleBrightness([...dark, ...bright]) > 200, "10% de pixels claros já pesam (percentil 90)");
  assert.ok(sampleBrightness(dark) < 20);
  assert.ok(sampleBrightness([...px(255, 255, 255, 0), ...px(5, 5, 5)]) < 20, "transparente não conta");
  for (const bad of [null, undefined, [], 5, "x", [1, 2]]) assert.equal(sampleBrightness(bad), 255);
});
test("faixa do véu = faixa aceita pelo banco (35 a 85 %) e texto do card = 400", () => {
  assert.equal(Math.round(SCRIM_MIN * 100), 35); assert.equal(Math.round(SCRIM_MAX * 100), 85); assert.equal(CARD_TEXT_MAX, 400);
});
test("véu: nunca menos que o mínimo, nunca mais que o máximo, e cresce com o brilho", () => {
  assert.equal(scrimAlpha(0), SCRIM_MIN);
  let prev = 0;
  for (let b = 0; b <= 255; b++) { const a = scrimAlpha(b); assert.ok(a >= SCRIM_MIN && a <= SCRIM_MAX); assert.ok(a >= prev - 1e-9, `não decresce em ${b}`); prev = a; }
  for (const bad of [NaN, Infinity, -5, 1e9, null, undefined]) { const a = scrimAlpha(bad); assert.ok(a >= SCRIM_MIN && a <= SCRIM_MAX); }
});
test("PROPRIEDADE: para qualquer fundo de 0 a 255 o texto branco fica com contraste AA (4,5:1) — inclusive no branco puro", () => {
  for (let b = 0; b <= 255; b++) {
    const a = scrimAlpha(b), v = b * (1 - a);
    assert.ok(contrast(1, relLuminance(v, v, v)) >= 4.5 - 1e-9, `fundo ${b}: véu ${a} dá ${contrast(1, relLuminance(v, v, v)).toFixed(2)}`);
  }
});
test("validar rascunho: cada regra recusa com texto claro", () => {
  const ok = { text: "Axé!", mode: "total", hasImage: true, ack: true, allowed: true };
  assert.equal(validateDraft(ok).ok, true);
  assert.match(validateDraft({ ...ok, text: "   " }).error, /Escreva algo/);
  assert.match(validateDraft({ ...ok, text: 5 }).error, /Escreva algo/);
  assert.match(validateDraft({ ...ok, allowed: false }).error, /Profissional/);
  assert.match(validateDraft({ ...ok, hasImage: false }).error, /imagem/);
  assert.match(validateDraft({ ...ok, text: "a".repeat(CARD_TEXT_MAX + 1) }).error, /até 400/);
  assert.match(validateDraft({ ...ok, ack: false }).error, /direito/);
  assert.match(validateDraft({ ...ok, ack: "true" }).error, /direito/);
  assert.equal(validateDraft({ ...ok, text: "a".repeat(CARD_TEXT_MAX) }).ok, true);
  assert.match(validateDraft({ ...ok, mode: "normal", text: "a".repeat(2001) }).error, /2000/);
});
test("card normal não exige plano, imagem nem confirmação (como hoje)", () => {
  assert.equal(validateDraft({ text: "Oi", mode: "normal", hasImage: false, ack: false, allowed: false }).ok, true);
  assert.equal(validateDraft({ text: "Oi", mode: "inventado", hasImage: false, ack: false, allowed: false }).ok, true);
  assert.equal(validateDraft({ text: "a".repeat(1500), mode: "normal", hasImage: false, ack: false, allowed: false }).ok, true);
});
