// Coerência entre documentos e código: números que ficam escritos em mais de um lugar não podem divergir em silêncio.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DEFAULT_PLAN_MATRIX } from "../src/lib/planMatrixCore.js";
import { FEE_BPS } from "../src/lib/paymentsCore.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const blueprint = read("docs/BLUEPRINT_DEFINITIVO.md");
const roadmap = read("docs/governanca/ROADMAP.md");
const porRecurso = read("docs/regras-por-recurso.md");
const br = (n) => n.toLocaleString("pt-BR");

test("franquia da assistente: Blueprint e regras por recurso trazem os números da matriz de planos", () => {
  const c = DEFAULT_PLAN_MATRIX.caps;
  const alvo = { base: c.base.assistant_replies, intermediario: c.intermediario.assistant_replies, maximo: c.maximo.assistant_replies, plus: c.plus.assistant_replies };
  assert.deepEqual(alvo, { base: 100, intermediario: 500, maximo: 1700, plus: 3400 }, "decisão do proprietário de 24/11/2026");
  const linha = blueprint.split("\n").find((l) => l.startsWith("- **Franquia mensal:**"));
  assert.ok(linha, "linha da franquia mensal no Blueprint");
  for (const n of Object.values(alvo)) assert.ok(linha.includes(br(n)), `Blueprint cita ${br(n)}`);
  for (const n of Object.values(alvo)) assert.ok(porRecurso.includes(br(n)), `regras por recurso citam ${br(n)}`);
  assert.ok(!/300 respostas\/mês/.test(porRecurso) && !/3\.000 respostas\/mês/.test(porRecurso));
});

test("comissão: 15% ritual e 4% nas demais, igual em todos os planos, e o Blueprint não diz o contrário", () => {
  assert.equal(FEE_BPS.ritual, 1500);
  assert.equal(FEE_BPS.servico, 400);
  assert.equal(FEE_BPS.mensalidade, 400);
  assert.ok(!/não cobra taxa de transação, vive da mensalidade/i.test(blueprint), "texto antigo (nos pagos não há taxa) voltou");
  assert.ok(/vale em TODOS os planos/.test(blueprint));
});

test("toda migração a partir da 0204 aparece no Roadmap", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /^\d{4}_/.test(f) && Number(f.slice(0, 4)) >= 204);
  assert.ok(files.length > 10);
  for (const f of files) {
    const n = f.slice(0, 4);
    assert.ok(roadmap.includes(n), `migração ${n} (${f}) não está no Roadmap`);
  }
});

test("o Roadmap não deixa 'precisa de deploy' pendurado e a política de aceite descreve a regra vigente", () => {
  assert.ok(!/precisa de deploy/i.test(roadmap));
  const pol = read("docs/legal/POLITICA_ACEITE_TERMOS.md");
  assert.ok(/reaparece/.test(pol) && /DOC_MIN_VERSION/.test(pol));
  assert.ok(!/não trava a tela de ninguém/.test(pol));
});
