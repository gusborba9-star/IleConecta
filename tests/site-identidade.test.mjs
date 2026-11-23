import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const casa = readFileSync(new URL("../api/casa.js", import.meta.url), "utf8");

test("endereço oficial e imagem de prévia são do próprio site (sem resto de outra plataforma nem foto de banco de imagens)", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/ileconecta\.com\.br\/" \/>/);
  assert.match(html, /property="og:url" content="https:\/\/ileconecta\.com\.br\/"/);
  assert.doesNotMatch(html, /onspace|unsplash/);
  assert.match(html, /property="og:image" content="https:\/\/ileconecta\.com\.br\/og\.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/ileconecta\.com\.br\/og\.png"/);
  assert.ok(existsSync(new URL("../public/og.png", import.meta.url)));
  assert.match(casa, /DEFAULT_IMAGE = "https:\/\/ileconecta\.com\.br\/og\.png"/);
});
