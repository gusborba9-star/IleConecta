import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// O Tailwind só deixa no CSS final as classes que aparecem escritas por inteiro no código. Montar "tone-" + nome fez sumir o anel colorido no celular.
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : []; });
const css = readFileSync("src/index.css", "utf8");
const code = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
test("toda classe tone-* do CSS aparece escrita por inteiro no código", () => {
  const nomes = [...new Set([...css.matchAll(/\.tone-([a-z]+)\s*\{/g)].map((m) => `tone-${m[1]}`))];
  assert.ok(nomes.length >= 4);
  for (const n of nomes) assert.ok(new RegExp(`["'\`]${n}["'\`]`).test(code), `${n} não aparece literal no código`);
});
test("ninguém monta tone-${...} na mão", () => {
  assert.ok(!/`tone-\$\{/.test(code));
});
