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
test("adminPath: módulo + tela + foco; início sem módulo; foco e tela inválidos somem", () => {
  assert.equal(adminPath("moderacao", ID, "denuncias-chat"), `?s=moderacao&c=denuncias-chat&foco=${ID}`);
  assert.equal(adminPath("suporte", null), "?s=suporte");
  assert.equal(adminPath("suporte", ID), `?s=suporte&foco=${ID}`);
  assert.equal(adminPath("visao", null), "");
  assert.equal(adminPath("visao", ID), `?foco=${ID}`);
  assert.equal(adminPath("moderacao", "x&s=docs", "avaliacoes"), "?s=moderacao&c=avaliacoes");
  assert.equal(adminPath("moderacao", null, 'x"&s=docs'), "?s=moderacao");
  assert.equal(adminPath("a&b", ID), `?s=a%26b&foco=${ID}`);
});
