import test from "node:test";
import assert from "node:assert/strict";
import { createSafeStorage } from "../src/lib/storageCore.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test("loads valid JSON and validates the persisted schema", () => {
  const raw = memoryStorage({ "demo:count": "3", "demo:bad": "{\"x\":true}" });
  const storage = createSafeStorage(() => raw, "demo");
  assert.equal(storage.loadKey("count", 0, (value) => Number.isInteger(value)), 3);
  assert.equal(storage.loadKey("bad", { x: false }, (value) => typeof value?.x === "string").x, false);
  assert.equal(raw.getItem("demo:recovery:bad"), "{\"x\":true}");
  assert.equal(raw.getItem("demo:bad"), null);
});

test("recovers from malformed JSON and retains a recovery copy", () => {
  const raw = memoryStorage({ "demo:users": "{not-json" });
  const storage = createSafeStorage(() => raw, "demo");
  assert.deepEqual(storage.loadKey("users", ["seed"]), ["seed"]);
  assert.equal(raw.getItem("demo:recovery:users"), "{not-json");
  assert.equal(raw.getItem("demo:users"), null);
});

test("reports serialization, quota and unavailable-storage failures", () => {
  const quotaStorage = memoryStorage();
  quotaStorage.setItem = () => { throw new Error("quota exceeded"); };
  const storage = createSafeStorage(() => quotaStorage, "demo");
  assert.equal(storage.saveKey("posts", [{ id: "p1" }]), false);

  const circular = {};
  circular.self = circular;
  assert.equal(createSafeStorage(() => memoryStorage(), "demo").saveKey("circular", circular), false);
  assert.equal(createSafeStorage(() => { throw new Error("blocked"); }, "demo").saveKey("x", 1), false);
  assert.deepEqual(createSafeStorage(() => null, "demo").loadKey("x", ["fallback"]), ["fallback"]);
});

test("clears only keys owned by the configured namespace", () => {
  const raw = memoryStorage({
    "demo:users": "[]",
    "demo:auth": "null",
    "other:settings": "keep",
  });
  assert.equal(createSafeStorage(() => raw, "demo").clearAll(), true);
  assert.equal(raw.getItem("demo:users"), null);
  assert.equal(raw.getItem("demo:auth"), null);
  assert.equal(raw.getItem("other:settings"), "keep");
});

test("handles storage read failures without throwing", () => {
  const broken = memoryStorage();
  broken.getItem = () => { throw new Error("blocked"); };
  assert.deepEqual(createSafeStorage(() => broken, "demo").loadKey("x", [1]), [1]);
});
