import test from "node:test";
import assert from "node:assert/strict";
import { readSeen, addSeen, SEEN_TTL_MS, SEEN_MAX } from "../src/lib/seenCore.js";

test("formato antigo (lista) é aceito", () => {
  assert.deepEqual(Object.keys(readSeen('["a","b"]', 1000)), ["a", "b"]);
});
test("itens com mais de 30 dias expiram", () => {
  const now = 10 * SEEN_TTL_MS;
  const m = readSeen(JSON.stringify({ velho: now - SEEN_TTL_MS - 1, novo: now - 1000 }), now);
  assert.deepEqual(Object.keys(m), ["novo"]);
});
test("limite de itens mantém os mais recentes", () => {
  let m = {};
  for (let i = 0; i < SEEN_MAX + 10; i++) m = addSeen(m, ["x" + i], i + 1);
  assert.equal(Object.keys(m).length, SEEN_MAX);
  assert.ok(!("x0" in m) && "x" + (SEEN_MAX + 9) in m);
});
test("lixo no armazenamento não quebra", () => {
  assert.deepEqual(readSeen("não é json"), {});
  assert.deepEqual(readSeen('{"a":"x"}'), {});
});
