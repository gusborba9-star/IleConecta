import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lockfile pins the Tailwind-compatible patched selector parser 6.x release", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  const parser = lock.packages["node_modules/postcss-selector-parser"];
  assert.equal(parser.version, "6.1.5");
  assert.equal(parser.resolved, "https://registry.npmjs.org/postcss-selector-parser/-/postcss-selector-parser-6.1.5.tgz");
  assert.match(parser.integrity, /^sha512-/);
});
