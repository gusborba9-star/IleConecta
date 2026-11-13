import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCents, readSummary, readAnomalies, anomalyLabel, severityTone, ANOMALY_LABELS } from "../src/lib/financePanelCore.js";

test("centavos viram reais sem erro de arredondamento", () => {
  assert.equal(formatCents(0), "R$ 0,00");
  assert.equal(formatCents(5), "R$ 0,05");
  assert.equal(formatCents(20100), "R$ 201,00");
  assert.equal(formatCents(123456789), "R$ 1.234.567,89");
  assert.equal(formatCents(-250), "-R$ 2,50");
  assert.equal(formatCents("abc"), "—");
  assert.equal(formatCents(null), "R$ 0,00");
});

test("leitura do resumo ignora lixo e preenche zeros", () => {
  const s = readSummary(null);
  assert.equal(s.payments, 0); assert.deepEqual(s.byKind, []); assert.equal(s.feeRuleVersion, "");
  const t = readSummary({ days: 30, fee_rule_version: "v2", totals: { payments: "3", confirmed_gross_cents: 20100, platform_fee_cents: "804" }, by_kind: [{ kind: "ritual", n: 1, gross_cents: 100, platform_fee_cents: 15 }, null, { n: 1 }], refunds: { open_n: 2 } });
  assert.equal(t.payments, 3); assert.equal(t.confirmedGross, 20100); assert.equal(t.platformFee, 804);
  assert.deepEqual(t.byKind, [{ kind: "ritual", n: 1, gross: 100, fee: 15 }]);
  assert.equal(t.refundsOpenN, 2);
});

test("leitura das anomalias normaliza gravidade e descarta itens inválidos", () => {
  const a = readAnomalies({ total: 5, items: [{ code: "contestado", severity: "alta", payment_id: "p1", detail: "x", amount_cents: 100, at: "2026-11-12" }, { code: "x", severity: "__proto__" }, { nocode: 1 }, null] });
  assert.equal(a.total, 5); assert.equal(a.shown, 2);
  assert.equal(a.items[1].severity, "baixa");
  assert.equal(readAnomalies(undefined).total, 0);
});

test("rótulos: sem chave herdada e todo código do banco tem rótulo", () => {
  assert.equal(anomalyLabel("__proto__"), "Divergência");
  assert.equal(anomalyLabel("constructor"), "Divergência");
  assert.equal(severityTone("alta"), "danger"); assert.equal(severityTone("media"), "gold"); assert.equal(severityTone("x"), "muted");
  const sql = readFileSync(new URL("../supabase/migrations/0086_painel_financeiro_admin.sql", import.meta.url), "utf8");
  const codes = [...sql.matchAll(/select '([a-z_]+)'(?:::text)?(?: as code)?,\s*'(?:alta|media|baixa)'/g)].map((m) => m[1]);
  assert.ok(codes.length >= 13, `códigos achados: ${codes.length}`);
  for (const c of codes) assert.ok(Object.hasOwn(ANOMALY_LABELS, c), `sem rótulo: ${c}`);
});
