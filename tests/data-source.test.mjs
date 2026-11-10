import test from "node:test";
import assert from "node:assert/strict";
import { exposeState } from "../src/lib/dataSource.js";

const demo = {
  users: [{ id: "demo-1" }, { id: "demo-2" }],
  posts: [{ id: "dp1", createdAt: "2024-01-01" }],
  stories: [{ id: "ds1" }],
  rituals: [{ id: "dr1" }],
  conversations: [{ id: "dc1" }],
  purchases: [{ id: "dpu1" }],
};
const real = { users: [{ id: "r1" }], posts: [{ id: "rp1", createdAt: "2026-01-01" }, { id: "rp2", createdAt: "2026-06-01" }] };

test("modo real: nenhum dado de demonstração é exposto", () => {
  const s = exposeState({ remote: true, demo, real });
  assert.deepEqual(s.users.map((u) => u.id), ["r1"]);
  assert.deepEqual(s.posts.map((p) => p.id), ["rp2", "rp1"]);
  for (const k of ["stories", "rituals", "conversations", "purchases"]) assert.deepEqual(s[k], []);
  assert.ok(!JSON.stringify(s).includes("demo") && !/"d(p|s|r|c|pu)\d/.test(JSON.stringify(s)));
});

test("modo real com vazio: tudo vazio", () => {
  const s = exposeState({ remote: true, demo, real: { users: [], posts: [] } });
  assert.equal(s.users.length + s.posts.length, 0);
});

test("modo demonstração segue como antes", () => {
  const s = exposeState({ remote: false, demo, real: { users: [], posts: [] } });
  assert.equal(s.users.length, 2);
  assert.equal(s.rituals.length, 1);
  assert.equal(s.purchases.length, 1);
});

test("usuário real com mesmo id substitui o de exemplo", () => {
  const s = exposeState({ remote: false, demo, real: { users: [{ id: "demo-1", x: 1 }], posts: [] } });
  assert.equal(s.users.filter((u) => u.id === "demo-1").length, 1);
  assert.equal(s.users.find((u) => u.id === "demo-1").x, 1);
});
