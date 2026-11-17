import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, MODULE_KEYS, SECTION_NEEDS, readAccess, canModule, canSection, allowedSections, readAdminList, togglePerm, NO_ACCESS } from "../src/lib/adminAccessCore.js";
const ORDER = ["visao", "reembolsos", "suporte", "usuarios", "config", "docs", "historico"];
const acc = (owner, perms) => readAccess({ admin: true, owner, perms });

test("lê o formato do banco; lixo vira sem acesso", () => {
  assert.deepEqual(readAccess({ admin: true, owner: false, perms: ["suporte"] }), { admin: true, owner: false, perms: ["suporte"] });
  for (const bad of [null, undefined, 3, "x", [], {}, { admin: "true" }, { admin: false, owner: true, perms: MODULE_KEYS }]) assert.equal(readAccess(bad), NO_ACCESS);
});
test("módulo inventado, repetido ou tipo errado é descartado", () => {
  assert.deepEqual(readAccess({ admin: true, perms: ["suporte", "suporte", "tudo", 5, null, "dono"] }).perms, ["suporte"]);
  assert.deepEqual(readAccess({ admin: true, perms: "suporte" }).perms, []);
});
test("dono pode tudo, inclusive 'dono'; delegado nunca 'dono'; sem módulo não pode nada", () => {
  const o = acc(true, []);
  for (const m of [...MODULE_KEYS, "dono"]) assert.equal(canModule(o, m), true);
  const d = acc(false, MODULE_KEYS);
  for (const m of MODULE_KEYS) assert.equal(canModule(d, m), true);
  assert.equal(canModule(d, "dono"), false);
  for (const m of [...MODULE_KEYS, "dono"]) assert.equal(canModule(acc(false, []), m), false);
  assert.equal(canModule(NO_ACCESS, "suporte"), false); assert.equal(canModule(null, "suporte"), false);
});
test("seções: cada módulo abre só o que deve", () => {
  assert.deepEqual(allowedSections(acc(true, []), ORDER), ORDER);
  assert.deepEqual(allowedSections(acc(false, []), ORDER), []);
  assert.deepEqual(allowedSections(NO_ACCESS, ORDER), []);
  assert.deepEqual(allowedSections(acc(false, ["suporte"]), ORDER), ["suporte"]);
  assert.deepEqual(allowedSections(acc(false, ["indicadores"]), ORDER), ["visao", "usuarios"]);
  assert.deepEqual(allowedSections(acc(false, ["moderacao"]), ORDER), ["config"]);
  assert.deepEqual(allowedSections(acc(false, ["contas"]), ORDER), []);
  for (const k of MODULE_KEYS) for (const s of ["reembolsos", "docs", "historico"]) assert.equal(canSection(acc(false, [k]), s), false, `${k} não abre ${s}`);
  assert.equal(canSection(acc(true, []), "inexistente"), false);
});
test("toda seção do painel tem regra e todo módulo tem rótulo e descrição", () => {
  assert.deepEqual(Object.keys(SECTION_NEEDS).sort(), [...ORDER].sort());
  for (const m of MODULES) { assert.ok(m.label.length > 3 && m.desc.length > 20); }
});
test("lista de administradores: defensiva", () => {
  const U = "00000000-0000-0000-0000-000000000001";
  const l = readAdminList([{ user_id: U, email: "a@x.com", name: "  Ana\n", owner: false, perms: ["suporte", "x"], created_at: "2026-01-01" }, null, 3, { user_id: "../x" }, { email: "sem id" }]);
  assert.equal(l.length, 1); assert.equal(l[0].name, "Ana"); assert.deepEqual(l[0].perms, ["suporte"]);
  assert.deepEqual(readAdminList("x"), []);
});
test("togglePerm liga e desliga, e ignora módulo inventado", () => {
  assert.deepEqual(togglePerm([], "suporte"), ["suporte"]);
  assert.deepEqual(togglePerm(["suporte", "contas"], "suporte"), ["contas"]);
  assert.deepEqual(togglePerm(["suporte"], "dono"), ["suporte"]);
});
