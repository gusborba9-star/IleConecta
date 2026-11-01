import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slugify, validateDoc, parseInline, parseBlocks, DOC_BODY_MAX } from "../src/lib/docsCore.js";

test("slugify tira acentos e símbolos", () => {
  assert.equal(slugify("Regras do Ilê Conecta — por recurso!"), "regras-do-ile-conecta-por-recurso");
  assert.equal(slugify("   "), "");
});

test("validateDoc exige título e limita o tamanho", () => {
  assert.equal(validateDoc({ title: " ", body: "x" }).ok, false);
  assert.equal(validateDoc({ title: "a".repeat(81), body: "" }).ok, false);
  assert.equal(validateDoc({ title: "ok", body: "x".repeat(DOC_BODY_MAX + 1) }).ok, false);
  const r = validateDoc({ title: " Regras ", body: "texto" });
  assert.deepEqual(r, { ok: true, title: "Regras", body: "texto" });
});

test("parseInline separa negrito e código", () => {
  assert.deepEqual(parseInline("a **b** `c` d"), [
    { t: "text", v: "a " }, { t: "b", v: "b" }, { t: "text", v: " " }, { t: "code", v: "c" }, { t: "text", v: " d" },
  ]);
});

test("parseBlocks: títulos, parágrafo, listas com recuo e tabela", () => {
  const b = parseBlocks("# T\n\nlinha 1\nlinha 2\n\n1. um\n   - sub\n2. dois\n\n| A | B |\n|---|---|\n| 1 | 2 |\n");
  assert.deepEqual(b[0], { type: "h", level: 1, text: "T" });
  assert.deepEqual(b[1], { type: "p", text: "linha 1 linha 2" });
  assert.deepEqual(b[2].items.map((x) => [x.marker, x.depth, x.text]), [["1.", 0, "um"], ["•", 1, "sub"], ["2.", 0, "dois"]]);
  assert.deepEqual(b[3], { type: "table", head: ["A", "B"], rows: [["1", "2"]] });
});

test("HTML cru não vira marcação: fica como texto", () => {
  const [p] = parseBlocks("<script>alert(1)</script>");
  assert.equal(p.type, "p");
  assert.equal(p.text, "<script>alert(1)</script>");
});

test("o documento de regras é lido por inteiro, sem sobrar linha de tabela como texto", () => {
  const md = readFileSync(new URL("../docs/regras-por-recurso.md", import.meta.url), "utf8");
  const blocks = parseBlocks(md);
  assert.ok(blocks.filter((b) => b.type === "table").length >= 2);
  assert.ok(!blocks.some((b) => b.type === "p" && b.text.includes("|---")));
  assert.ok(md.length < DOC_BODY_MAX);
});
