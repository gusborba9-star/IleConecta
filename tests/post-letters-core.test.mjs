import test from "node:test";
import assert from "node:assert/strict";
import { FONTS, SIZES, COLORS_TOTAL, COLORS_PARCIAL, PAPER, ALIGNS, POSITIONS, EMPTY_LETTERS, colorsFor, normalizeLetters, fitToMode, isDefaultLetters, lettersToColumns, lettersFromRow, hexLum, scrimPctFor, lettersLook } from "../src/lib/postLettersCore.js";
import { contrast, relLuminance, MIN_CONTRAST, scrimAlpha } from "../src/lib/postCardCore.js";

const ids = (l) => l.map((x) => x.id);
test("listas fechadas (têm de bater com as restrições do banco, 0142)", () => {
  assert.deepEqual(ids(FONTS), ["classica", "moderna", "elegante", "manuscrita", "ritual"]);
  assert.deepEqual(ids(SIZES), ["p", "m", "g"]);
  assert.deepEqual(ids(COLORS_TOTAL), ["branco", "creme", "dourado", "rosa", "verdeclaro", "azulclaro"]);
  assert.deepEqual(ids(COLORS_PARCIAL), ["preto", "floresta", "vinho", "marrom", "marinho", "roxo"]);
  assert.deepEqual(ids(ALIGNS), ["esq", "centro", "dir"]);
  assert.deepEqual(ids(POSITIONS), ["topo", "meio", "base"]);
  assert.equal(new Set([...ids(COLORS_TOTAL), ...ids(COLORS_PARCIAL)]).size, 12);
  for (const c of [...COLORS_TOTAL, ...COLORS_PARCIAL]) assert.match(c.hex, /^#[0-9A-F]{6}$/);
});
test("paleta fixa (mudar uma cor é decisão de design, não acidente)", () => {
  assert.deepEqual(COLORS_TOTAL.map((c) => c.hex), ["#FFFFFF", "#FFF1D0", "#F5D06F", "#FFD3DD", "#CDEFD9", "#D3E6FF"]);
  assert.deepEqual(COLORS_PARCIAL.map((c) => c.hex), ["#1A1A1A", "#14543F", "#7A1F3D", "#5A3A1E", "#1F3A63", "#4B2A6B"]);
  assert.equal(PAPER, "#FBF7EE");
});
test("LEITURA: toda cor clara chega a contraste AA no ponto mais claro da foto com o véu calculado (qualquer foto)", () => {
  for (const c of COLORS_TOTAL) for (let b = 0; b <= 255; b += 5) {
    const a = scrimPctFor(b, c.id) / 100;
    assert.ok(a >= 0.35 && a <= 0.85, `${c.id} b=${b} véu ${a}`);
    const v = b * (1 - a);
    assert.ok(contrast(hexLum(c.hex), relLuminance(v, v, v)) >= MIN_CONTRAST, `${c.id} em foto de brilho ${b}: contraste baixo`);
  }
});
test("LEITURA: toda cor escura chega a contraste 7 (AAA) sobre o papel do card", () => {
  for (const c of COLORS_PARCIAL) assert.ok(contrast(hexLum(PAPER), hexLum(c.hex)) >= 7, `${c.id} sobre o papel`);
});
test("o véu leva em conta a cor: cor mais escura que o branco pede véu igual ou mais forte; sem cor = branco", () => {
  for (const c of COLORS_TOTAL) assert.ok(scrimPctFor(200, c.id) >= scrimPctFor(200, "branco"), c.id);
  assert.equal(scrimPctFor(200, null), Math.round(scrimAlpha(200) * 100));
  assert.ok(scrimPctFor(255, "dourado") > scrimPctFor(255, "branco") - 1);
});
test("normalize: lixo vira padrão; nada fora da lista passa (nem texto que pareça CSS)", () => {
  for (const bad of [null, undefined, 5, "x", [], {}]) assert.deepEqual(normalizeLetters(bad), EMPTY_LETTERS);
  const hostile = normalizeLetters({ font: "x;background:url(http://a)", size: "gigante", color: "#ff0000", align: "justify", pos: "fundo", bold: "sim", italic: 1 });
  assert.deepEqual(hostile, EMPTY_LETTERS);
  const good = normalizeLetters({ font: "ritual", size: "g", color: "dourado", align: "centro", pos: "meio", bold: true, italic: true });
  assert.deepEqual(good, { font: "ritual", size: "g", color: "dourado", align: "centro", pos: "meio", bold: true, italic: true });
});
test("fitToMode: modo normal não tem letras; cor do modo errado e posição no parcial caem; o resto fica", () => {
  const all = { font: "elegante", size: "m", color: "dourado", align: "dir", pos: "topo", bold: true, italic: false };
  assert.deepEqual(fitToMode(all, "normal"), EMPTY_LETTERS);
  assert.deepEqual(fitToMode(all, "total"), { ...all });
  assert.deepEqual(fitToMode(all, "parcial"), { ...all, color: null, pos: null });
  assert.equal(fitToMode({ color: "preto" }, "total").color, null);
  assert.equal(fitToMode({ color: "preto" }, "parcial").color, "preto");
  assert.deepEqual(colorsFor("normal"), []);
});
test("colunas do banco: ida e volta, padrão = tudo nulo/falso", () => {
  const l = { font: "manuscrita", size: "p", color: "rosa", align: "esq", pos: "base", bold: false, italic: true };
  assert.deepEqual(lettersFromRow(lettersToColumns(l)), l);
  assert.deepEqual(lettersToColumns(EMPTY_LETTERS), { card_font: null, card_size: null, card_color: null, card_align: null, card_pos: null, card_bold: false, card_italic: false });
  assert.deepEqual(lettersFromRow({ card_font: "invasor", card_bold: "true" }), EMPTY_LETTERS);
  assert.ok(isDefaultLetters(null) && isDefaultLetters({}) && !isDefaultLetters({ bold: true }));
});
test("desenho: padrão não muda nada; fonte/tamanho/negrito/cor chegam certos", () => {
  const none = lettersLook(EMPTY_LETTERS, "total");
  assert.equal(none.custom, false); assert.equal(none.family, null); assert.equal(none.fontSizePx, null); assert.equal(none.weight, null); assert.equal(none.color, null);
  const l = lettersLook({ font: "ritual", size: "g", color: "dourado", bold: true, italic: true, align: "centro", pos: "meio" }, "total");
  assert.equal(l.custom, true); assert.match(l.family, /Cinzel/); assert.equal(l.fontSizePx, Math.round(26 * 0.92 * 10) / 10); assert.equal(l.weight, 700); assert.equal(l.italic, true); assert.equal(l.color, "#F5D06F"); assert.equal(l.align, "centro"); assert.equal(l.pos, "meio");
  const p = lettersLook({ font: "moderna", size: "p", color: "preto", pos: "topo" }, "parcial");
  assert.equal(p.fontSizePx, 14); assert.equal(p.color, "#1A1A1A"); assert.equal(p.pos, null); assert.equal(p.weight, 500);
  assert.equal(lettersLook({ color: "preto" }, "total").color, null); // cor escura sobre a foto é descartada
  assert.ok(lettersLook({ font: "manuscrita" }, "total").fontSizePx > 17); // só a fonte: tamanho padrão compensado pela fonte
});
