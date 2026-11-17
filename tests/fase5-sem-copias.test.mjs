// Critério de saída da Fase 5: "nenhuma cópia paralela de pedidos, conversas ou transações como fonte oficial".
// As migrations da fase só podem criar as duas tabelas decididas pelo proprietário e as visões nunca escrevem em dados de negócio.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const files = readdirSync("supabase/migrations").filter((f) => /^01(29|3[0-6])_/.test(f)).sort();
const strip = (sql) => sql.replace(/--[^\n]*/g, "");

test("a Fase 5 existe e cobre as migrations 0129 a 0136", () => {
  assert.deepEqual(files.map((f) => f.slice(0, 4)), ["0129", "0130", "0131", "0132", "0133", "0134", "0135", "0136"]);
});
test("só duas tabelas novas: histórico de plano e dias de atividade (decisões do proprietário)", () => {
  const created = files.flatMap((f) => [...strip(readFileSync(`supabase/migrations/${f}`, "utf8")).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi)].map((m) => m[1].toLowerCase()));
  assert.deepEqual(created.sort(), ["house_plan_history", "user_activity_days"]);
});
test("as visões (pendências, pessoas, indicadores, linha do tempo) só leem: nenhuma escreve em dado de negócio", () => {
  const WRITE = /\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i;
  const READ_ONLY = ["0129_", "0130_", "0131_", "0132_", "0133_", "0135_", "0136_"];
  for (const f of files.filter((x) => READ_ONLY.some((p) => x.startsWith(p)))) {
    const sql = strip(readFileSync(`supabase/migrations/${f}`, "utf8"));
    const writes = [...sql.matchAll(new RegExp(WRITE, "gi"))].map((m) => sql.slice(m.index, m.index + 60).replace(/\s+/g, " "));
    // única escrita permitida: o registro de auditoria da linha do tempo da casa (0136)
    // (e, na 0129, o carimbo de "denúncia de avaliação analisada", que é ação da administração e não cópia de dado)
    const bad = writes.filter((w) => !/insert into public\.admin_audit/i.test(w) && !(f.startsWith("0129_") && /update public\.reviews set (report_reviewed_at|reported_at)/i.test(w)));
    assert.deepEqual(bad, [], f);
  }
});
test("toda função de leitura da fase fixa o search_path e revoga o acesso público", () => {
  for (const f of files.filter((x) => ["0129_", "0130_", "0131_", "0132_", "0133_", "0135_", "0136_"].some((p) => x.startsWith(p)))) {
    const sql = strip(readFileSync(`supabase/migrations/${f}`, "utf8"));
    const defs = [...sql.matchAll(/create or replace function public\.([a-z_]+)\(([^)]*)\)[\s\S]*?\$\$;/gi)];
    for (const d of defs) {
      const head = d[0].slice(0, 400);
      if (/security definer/i.test(head)) assert.match(head, /set search_path\s*=\s*public/i, `${f}: ${d[1]} sem search_path fixo`);
    }
    if (defs.length) assert.match(sql, /revoke all on function/i, `${f} sem revoke`);
  }
});

test("segmentos de pessoas são só para ver: nada de exportar nem de mensagem em massa (finalidade)", () => {
  for (const f of ["src/pages/Pessoas.tsx", "src/lib/housePeople.ts", "src/lib/housePeopleCore.js"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /exportar|\.csv|download=|mensagem em massa|enviar para todos|broadcast|sendBulk/i, f);
  }
});
