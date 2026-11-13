import test from "node:test";
import assert from "node:assert/strict";
import { isAssistantPhotoPath, isOwnPhotoPath } from "../src/lib/assistantPhotoCore.js";
import { DEFAULT_PLAN_MATRIX } from "../src/lib/planMatrixCore.js";

const OWN = "b1000000-0000-0000-0000-0000000000b1";

test("caminho da foto: só o formato exato da pasta da dona", () => {
  assert.equal(isAssistantPhotoPath(`${OWN}/assistant-1731400000123.webp`), true);
  assert.equal(isAssistantPhotoPath(`${OWN}/assistant-1731400000.jpg`), true);
  for (const bad of [null, undefined, 5, {}, "", "x", `${OWN}/assistant-1.webp`, `${OWN}/assistant-1731400000.png`, `${OWN}/../x/assistant-1731400000.webp`,
    `${OWN.toUpperCase()}/assistant-1731400000.webp`, `https://evil.example/${OWN}/assistant-1731400000.webp`, `${OWN}/assistant-1731400000.webp\n`, `${OWN}/assistant-1731400000.webp?x=1`, `/${OWN}/assistant-1731400000.webp`]) {
    assert.equal(isAssistantPhotoPath(bad), false, String(bad));
  }
});

test("a foto precisa ser da pasta da própria dona", () => {
  const p = `${OWN}/assistant-1731400000.webp`;
  assert.equal(isOwnPhotoPath(p, OWN), true);
  assert.equal(isOwnPhotoPath(p, OWN.toUpperCase()), true);
  assert.equal(isOwnPhotoPath(p, "b2000000-0000-0000-0000-0000000000b2"), false);
  assert.equal(isOwnPhotoPath(p, null), false);
  assert.equal(isOwnPhotoPath("lixo", OWN), false);
});

test("textos dos planos: a casa escolhe o nome da assistente, então nenhum texto fala 'Lara'", () => {
  assert.doesNotMatch(JSON.stringify(DEFAULT_PLAN_MATRIX), /Lara/);
  const texts = ["intermediario", "maximo"].flatMap((p) => DEFAULT_PLAN_MATRIX.copy[p].benefits.map((b) => b.text));
  assert.ok(texts.some((t) => /^A assistente da casa atende 24h/.test(t)));
  assert.ok(texts.some((t) => /^A assistente com até \{assistant_replies\}/.test(t)));
});
