import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategory, matchesFilter, sameCity, categoryLabel } from "../src/lib/postCategoryCore.js";
test("categoria desconhecida vira geral", () => {
  assert.equal(normalizeCategory("aviso"), "aviso");
  assert.equal(normalizeCategory("x'; drop"), "geral");
  assert.equal(normalizeCategory(undefined), "geral");
  assert.equal(categoryLabel("evento"), "Giras e eventos");
  assert.equal(categoryLabel("geral"), null);
});
test("filtros", () => {
  assert.equal(matchesFilter("todos", { category: "aviso" }), true);
  assert.equal(matchesFilter("aviso", { category: "aviso" }), true);
  assert.equal(matchesFilter("evento", { category: undefined }), false);
  assert.equal(matchesFilter("perto", { authorCity: "Salvador", viewerCity: " salvador " }), true);
  assert.equal(matchesFilter("perto", { authorCity: "São Paulo", viewerCity: "Sao Paulo" }), true);
  assert.equal(matchesFilter("perto", { authorCity: "", viewerCity: "" }), false);
  assert.equal(sameCity("A", "B"), false);
});
