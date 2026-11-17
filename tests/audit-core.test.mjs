import test from "node:test";
import assert from "node:assert/strict";
import { readAudit, mergeAudit, filterAudit, actors } from "../src/lib/auditCore.js";
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
const r = (o = {}) => ({ id: 5, key: "pricing", created_at: "2026-11-16T10:00:00Z", admin_id: A, actor: "Gustavo", ...o });

test("lê o formato do banco", () => {
  assert.deepEqual(readAudit([r()]), [{ id: 5, key: "pricing", createdAt: "2026-11-16T10:00:00Z", adminId: A, actor: "Gustavo" }]);
});
test("lixo vira vazio e linha malformada some", () => {
  for (const bad of [null, undefined, 3, "x", {}]) assert.deepEqual(readAudit(bad), []);
  assert.equal(readAudit([r(), null, 4, r({ id: -1 }), r({ id: 1.5 }), r({ id: "x" }), r({ key: "" }), r({ key: 5 }), r({ created_at: "ontem" }), r({ key: "k".repeat(121) })]).length, 1);
});
test("quem fez ausente ou inválido nunca vira outra pessoa", () => {
  const [x] = readAudit([r({ admin_id: "../x", actor: null })]);
  assert.equal(x.adminId, null); assert.equal(x.actor, "Administrador removido");
  assert.equal(readAudit([r({ actor: "   " })])[0].actor, "Administrador removido");
});
test("nome hostil fica como texto limpo e curto", () => {
  const [x] = readAudit([r({ actor: "<img onerror=1>\n\u0000" + "a".repeat(200) })]);
  assert.ok(x.actor.length <= 80); assert.ok(!/[\n\u0000]/.test(x.actor)); assert.ok(x.actor.startsWith("<img"));
});
test("mescla sem repetir e do mais novo ao mais antigo; filtra e lista autores", () => {
  const a = readAudit([r({ id: 3 }), r({ id: 2, admin_id: B, actor: "Ana" })]), b = readAudit([r({ id: 2, admin_id: B, actor: "Ana" }), r({ id: 1 })]);
  const m = mergeAudit(a, b);
  assert.deepEqual(m.map((x) => x.id), [3, 2, 1]);
  assert.deepEqual(filterAudit(m, B).map((x) => x.id), [2]);
  assert.equal(filterAudit(m, null).length, 3);
  assert.deepEqual(actors(m), [{ id: B, name: "Ana" }, { id: A, name: "Gustavo" }]);
});
