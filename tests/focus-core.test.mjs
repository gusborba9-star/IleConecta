import test from "node:test";
import assert from "node:assert/strict";
import { readFocus, focusRow, adminPath } from "../src/lib/focusCore.js";

const ID = "00000000-0000-0000-0000-000000000211";
test("readFocus: só UUID (vem da URL e entra em seletor)", () => {
  assert.equal(readFocus(ID), ID);
  const HEX = "ABCDEF01-2345-6789-abcd-ef0123456789";
  assert.equal(readFocus(HEX), HEX.toLowerCase());
  for (const bad of [null, undefined, "", "x", 5, {}, `${ID}"]`, `"]),alert(1)//`, `${ID} `, `x${ID}`, `${ID}x`, "../etc/passwd", `${ID}\n`]) assert.equal(readFocus(bad), null, String(bad));
});
test("focusRow: atributo só para UUID", () => {
  assert.deepEqual(focusRow(ID), { "data-foco": ID });
  assert.deepEqual(focusRow("nao-uuid"), {});
  assert.deepEqual(focusRow(undefined), {});
});
test("adminPath: seção + foco; visão sem seção; foco inválido some", () => {
  assert.equal(adminPath("config", ID), `?s=config&foco=${ID}`);
  assert.equal(adminPath("suporte", null), "?s=suporte");
  assert.equal(adminPath("visao", null), "");
  assert.equal(adminPath("visao", ID), `?foco=${ID}`);
  assert.equal(adminPath("config", "x&s=docs"), "?s=config");
  assert.equal(adminPath("a&b", ID), `?s=a%26b&foco=${ID}`);
});
