import test from "node:test";
import assert from "node:assert/strict";
import { reachSets, canSee } from "../src/lib/reachCore.js";
const s = reachSets({ follows: ["A"], bonds: ["B"], highlightOwners: ["H"], boostedItemIds: ["p9"] });
test("vê: o próprio, seguidas, com vínculo, em destaque e impulsionado", () => {
  assert.equal(canSee({ viewerId: "V", ownerId: "V" }, s), true);
  assert.equal(canSee({ viewerId: "V", ownerId: "A" }, s), true);
  assert.equal(canSee({ viewerId: "V", ownerId: "B" }, s), true);
  assert.equal(canSee({ viewerId: "V", ownerId: "H" }, s), true);
  assert.equal(canSee({ viewerId: "V", ownerId: "X", itemId: "p9" }, s), true);
});
test("não vê: casa sem vínculo nem impulso; sem dono; item não impulsionado", () => {
  assert.equal(canSee({ viewerId: "V", ownerId: "X", itemId: "p1" }, s), false);
  assert.equal(canSee({ viewerId: "V", ownerId: null }, s), false);
  assert.equal(canSee({ viewerId: null, ownerId: "X" }, reachSets()), false);
});
