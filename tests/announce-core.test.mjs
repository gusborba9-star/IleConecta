import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/lib/announce.ts", import.meta.url), "utf8");
const HREF = new RegExp(src.match(/HREF_PATTERN = \/(.+)\/;/)[1]);
test("padrão de link aceita só caminhos internos", () => {
  for (const ok of ["/", "/planos", "/sobre/novidades-seguranca", "/moderacao"]) assert.match(ok, HREF);
  for (const bad of ["https://x.com", "//evil.com", "javascript:alert(1)", "planos", "/a b"]) assert.doesNotMatch(bad, HREF);
});
test("links do seletor são válidos", () => {
  for (const m of src.matchAll(/href: "([^"]*)"/g)) if (m[1]) assert.match(m[1], HREF);
});
