import test from "node:test";
import assert from "node:assert/strict";
import { KINDS, validateReport, sortQueue, validateSupportEmail, priorityText, isClosed } from "../src/lib/supportCore.js";

const ok = { kind: "pagamento", title: "Cobrança", description: "Fui cobrado duas vezes.", consent: true };
test("relato válido passa", () => assert.equal(validateReport(ok), null));
test("tipo inválido, título curto, descrição curta/longa e sem ciência são recusados", () => {
  assert.ok(validateReport({ ...ok, kind: "x" }));
  assert.ok(validateReport({ ...ok, title: " a " }));
  assert.ok(validateReport({ ...ok, description: "curta" }));
  assert.ok(validateReport({ ...ok, description: "a".repeat(2001) }));
  assert.ok(validateReport({ ...ok, consent: false }));
  assert.ok(validateReport({ ...ok, consent: "true" }));
});
test("16 tipos, ids únicos, só risco_vida é urgente", () => {
  assert.equal(KINDS.length, 16); assert.equal(new Set(KINDS.map((k) => k.id)).size, 16);
  assert.deepEqual(KINDS.filter((k) => k.priority === "urgente").map((k) => k.id), ["risco_vida"]);
});
test("LGPD mostra 15 dias; os demais seguem a prioridade", () => {
  assert.match(priorityText("exclusao_conta", "alta"), /15 dias/); assert.match(priorityText("pagamento", "alta"), /24 h/); assert.match(priorityText("duvida", "normal"), /3 dias/);
});
test("fila: urgente primeiro, depois prazo; não altera a lista original", () => {
  const rows = [{ priority: "normal", first_response_due: "2026-01-01" }, { priority: "alta", first_response_due: "2026-01-03" }, { priority: "alta", first_response_due: "2026-01-02" }, { priority: "urgente", first_response_due: "2026-02-01" }];
  const s = sortQueue(rows);
  assert.deepEqual(s.map((r) => r.priority + r.first_response_due), ["urgente2026-02-01", "alta2026-01-02", "alta2026-01-03", "normal2026-01-01"]);
  assert.equal(rows[0].priority, "normal");
});
test("e-mail de suporte: vazio vale, inválido não", () => {
  assert.equal(validateSupportEmail(""), null); assert.equal(validateSupportEmail("  "), null); assert.equal(validateSupportEmail("a@b.co"), null);
  assert.ok(validateSupportEmail("sem-arroba")); assert.ok(validateSupportEmail("a b@c.com")); assert.ok(validateSupportEmail("a@b.co" + "x".repeat(130)));
});
test("encerrados", () => { assert.ok(isClosed("resolvido")); assert.ok(isClosed("recusado")); assert.ok(!isClosed("aberto")); });

import { readFileSync } from "node:fs";
test("os tipos e prioridades do app são iguais aos do banco (0078)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0078_chamados_e_casos.sql", import.meta.url), "utf8");
  const check = sql.match(/kind text not null check \(kind in \(([^)]*)\)/)[1].match(/'([a-z_]+)'/g).map((x) => x.replace(/'/g, ""));
  assert.deepEqual([...check].sort(), KINDS.map((k) => k.id).sort());
  const meta = sql.slice(sql.indexOf("from (values"), sql.indexOf(") as m(k, pr, hrs)"));
  for (const [, k, pr] of meta.matchAll(/\('([a-z_]+)', '([a-z]+)'/g)) assert.equal(KINDS.find((x) => x.id === k).priority, pr, k);
});
