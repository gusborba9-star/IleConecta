import test from "node:test";
import assert from "node:assert/strict";
import { decodeToken, remember, candidates, MAX_TOKENS } from "../src/lib/promoTokenCore.js";

const hex = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("hex");
const now = Date.parse("2026-11-22T15:00:00Z");
const mk = (h, iatOffsetS, expOffsetS = 7 * 86400) => `${hex({ v: 1, p: `p-${h}`, h, iat: now / 1000 + iatOffsetS, exp: now / 1000 + iatOffsetS + expOffsetS, n: "x" })}.${"a".repeat(64)}`;

test("decodeToken lê o conteúdo e rejeita lixo", () => {
  const d = decodeToken(mk("h1", -60));
  assert.equal(d.h, "h1"); assert.equal(d.p, "p-h1");
  for (const bad of [null, 5, "", "abc", "zz.yy", "1.2", `${hex({ v: 2, p: "a", h: "b", iat: 1, exp: 2 })}.sig`, `${hex({ v: 1, p: "a" })}.sig`, "a".repeat(3000)]) assert.equal(decodeToken(bad), null, String(bad).slice(0, 12));
});
test("último anúncio da mesma casa vence; vencidos saem", () => {
  let s = remember({}, mk("h1", -3600), now);
  s = remember(s, mk("h1", -60), now);
  assert.equal(Object.keys(s).length, 1);
  assert.equal(decodeToken(s.h1).iat * 1000, now - 60_000);
  s = remember(s, mk("h2", -8 * 86400), now); // já vencido: não entra
  assert.deepEqual(Object.keys(s), ["h1"]);
  const later = now + 8 * 86400_000; // 8 dias depois: tudo vencido
  assert.deepEqual(remember(s, "lixo", later), {});
});
test("token com data no futuro distante não é guardado", () => {
  assert.deepEqual(remember({}, mk("h1", 3600), now), {});
});
test("candidatos: mais recente primeiro, só válidos, com limite; guarda no máximo 20", () => {
  let s = {};
  for (let i = 0; i < 25; i++) s = remember(s, mk(`h${i}`, -i * 60), now);
  assert.equal(Object.keys(s).length, MAX_TOKENS);
  const c = candidates(s, now);
  assert.equal(c.length, 4);
  assert.equal(decodeToken(c[0]).h, "h0");
  assert.deepEqual(candidates(null, now), []);
});
