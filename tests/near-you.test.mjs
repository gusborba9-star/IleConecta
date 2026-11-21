import test from "node:test";
import assert from "node:assert/strict";
import { pickNearYou, dateBlock } from "../src/lib/nearYouCore.js";
const H = 3600e3, now = Date.parse("2026-11-21T12:00:00Z");
const r = (id, owner, inH, o = {}) => ({ id, ownerId: owner, houseName: "C" + owner, title: "T" + id, startsAt: new Date(now + inH * H).toISOString(), seatsTotal: 10, taken: 2, status: "publicado", ...o });
const cityOf = (o) => ({ a: "Salvador", b: "Manaus", c: "salvador" }[o]);
test("destaque, depois cidade, depois data; esgotado vai ao fim", () => {
  const out = pickNearYou({ rituals: [r(1, "b", 5), r(2, "a", 30), r(3, "c", 10), r(4, "b", 40, { taken: 10 }), r(5, "b", 60)], cityOf, viewerCity: "Salvador", highlightOwners: ["b"], now });
  assert.deepEqual(out.map((x) => x.id), [1, 5, 3, 2, 4]);
  assert.equal(out[0].featured, true); assert.equal(out[2].near, true); assert.equal(out[4].soldOut, true);
});
test("passados, rascunhos e sem dono ficam de fora; limite", () => {
  const list = [r(1, "a", -5), r(2, "a", 5, { status: "rascunho" }), r(3, null, 5), r(4, "a", 5), r(5, "a", 6)];
  assert.deepEqual(pickNearYou({ rituals: list, cityOf, viewerCity: "", now, limit: 1 }).map((x) => x.id), [4]);
});
test("bloco de data em Brasília", () => {
  assert.deepEqual(dateBlock("2026-11-28T23:00:00Z"), { day: "28", month: "NOV", time: "20h" });
  assert.equal(dateBlock("2026-12-01T22:30:00Z").time, "19h30");
});
