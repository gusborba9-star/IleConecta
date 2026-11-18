import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/lib/momentEditCore.js";

test("foto inteira: scale 1 cabe no palco, centrada", () => {
  const r = C.imageRect(4000, 3000, 1080, 1920, C.defaultFrame());
  assert.equal(Math.round(r.w), 1080); assert.equal(Math.round(r.h), 810); assert.equal(Math.round(r.x), 0); assert.equal(Math.round(r.y), 555);
});
test("foto em pé 9:16 preenche exatamente", () => {
  const r = C.imageRect(1080, 1920, 1080, 1920, C.defaultFrame());
  assert.deepEqual([r.x, r.y, r.w, r.h].map(Math.round), [0, 0, 1080, 1920]);
});
test("preencher: escala cobre o palco sem sobras e respeita o máximo", () => {
  const s = C.coverScale(4000, 3000, 1080, 1920);
  const r = C.imageRect(4000, 3000, 1080, 1920, { scale: s, cx: 0.5, cy: 0.5 });
  assert.ok(r.h >= 1919.9 && r.w >= 1080);
  assert.equal(C.coverScale(10000, 100, 1080, 1920), C.ZOOM_MAX); // panorama extremo: limita no máximo
  assert.equal(C.coverScale(1080, 1920, 1080, 1920), 1);
});
test("clampFrame: aproximado não deixa buraco; afastado não sai da tela", () => {
  const z = C.clampFrame(4000, 3000, 1080, 1920, { scale: 3, cx: 5, cy: -5 });
  const r = C.imageRect(4000, 3000, 1080, 1920, z);
  assert.ok(r.x <= 0.001 && r.x + r.w >= 1079.99 && r.y <= 0.001 && r.y + r.h >= 1919.99);
  const f = C.clampFrame(4000, 3000, 1080, 1920, { scale: 1, cx: 9, cy: 9 });
  const q = C.imageRect(4000, 3000, 1080, 1920, f);
  assert.ok(q.x >= -0.001 && q.x + q.w <= 1080.001 && q.y >= -0.001 && q.y + q.h <= 1920.001);
});
test("clampFrame: entradas absurdas (NaN, infinito, negativo) viram valores válidos", () => {
  const f = C.clampFrame(100, 100, 1080, 1920, { scale: NaN, cx: Infinity, cy: undefined });
  assert.ok(Number.isFinite(f.scale) && Number.isFinite(f.cx) && Number.isFinite(f.cy));
  assert.equal(C.clampFrame(100, 100, 1080, 1920, { scale: -3, cx: 0.5, cy: 0.5 }).scale, C.ZOOM_MIN);
  assert.equal(C.clampFrame(100, 100, 1080, 1920, { scale: 99, cx: 0.5, cy: 0.5 }).scale, C.ZOOM_MAX);
});
test("pinça: proporcional, limitada e segura com distância zero", () => {
  assert.equal(C.pinchValue(1, 100, 200, 1, 4), 2);
  assert.equal(C.pinchValue(1, 100, 900, 1, 4), 4);
  assert.equal(C.pinchValue(2, 100, 10, 1, 4), 1);
  assert.equal(C.pinchValue(2, 0, 50, 1, 4), 2);
});
test("camadas: texto é limpo, cor/fonte inválidas caem no padrão, posição e tamanho ficam nos limites", () => {
  const l = C.sanitizeLayer({ id: "a", kind: "text", text: "Axé\u0000 ‮olá", font: "comic", color: "red", size: 9, x: -4, y: 4 });
  assert.equal(l.font, "moderna"); assert.equal(l.color, "#FFFFFF"); assert.equal(l.size, C.SIZE_MAX); assert.equal(l.x, 0.02); assert.equal(l.y, 0.98);
  assert.ok(!/[\u0000‮]/.test(l.text));
  assert.equal(C.sanitizeLayer({ text: "   " }), null);
  assert.equal(C.sanitizeLayer(null), null);
  assert.equal(C.sanitizeLayer({ text: "x".repeat(500) }).text.length, C.TEXT_MAX);
  assert.equal(C.sanitizeLayer({ color: "#abcdef", text: "ok" }).color, "#ABCDEF");
});
test("camadas: emoji perde espaços; lista é limitada e ignora lixo", () => {
  assert.equal(C.makeLayer("emoji", "🙏 ✨").text, "🙏✨");
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, text: "a" }));
  assert.equal(C.sanitizeLayers(many).length, C.LAYERS_MAX);
  assert.deepEqual(C.sanitizeLayers("nada"), []);
  assert.equal(C.sanitizeLayers([null, 3, { text: "" }, { text: "ok" }]).length, 1);
});
test("quebra de linha: respeita a largura, parágrafos e palavras gigantes", () => {
  const m = (s) => s.length * 10;
  assert.deepEqual(C.wrapLines("uma frase curta aqui", 100, m), ["uma frase", "curta aqui"]);
  assert.deepEqual(C.wrapLines("a\n\nb", 100, m), ["a", "", "b"]);
  const big = C.wrapLines("x".repeat(35), 100, m);
  assert.ok(big.length >= 4 && big.every((s) => m(s) <= 100));
  assert.ok(C.wrapLines(Array(100).fill("palavra").join("\n"), 100, m).length <= 12);
});
test("toque: acha a camada de cima primeiro", () => {
  const boxes = [{ id: "a", x: 0, y: 0, w: 100, h: 100 }, { id: "b", x: 50, y: 50, w: 100, h: 100 }];
  assert.equal(C.hitLayer(boxes, 60, 60), "b"); assert.equal(C.hitLayer(boxes, 10, 10), "a"); assert.equal(C.hitLayer(boxes, 500, 5), null);
});
test("fontes, cores e emojis curados são únicos e bem formados", () => {
  assert.equal(new Set(C.EDIT_FONTS.map((f) => f.key)).size, C.EDIT_FONTS.length);
  assert.ok(C.EDIT_COLORS.every((c) => /^#[0-9A-F]{6}$/.test(c.hex)));
  assert.equal(new Set(C.EDIT_EMOJIS).size, C.EDIT_EMOJIS.length);
});
