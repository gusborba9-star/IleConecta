// Gera os passos de produção (supabase/rollout/passo-NN.sql) a partir de migrations: cada passo é pequeno, termina entre instruções
// completas e pode ser rodado de novo. Uso: node scripts/split-rollout.mjs <primeiro-numero-de-passo> <migration> [<migration>...]
import { readFileSync, writeFileSync } from "node:fs";

/** Divide o SQL em instruções (respeita $$…$$, aspas simples e comentários). Cada item guarda o texto original com os comentários que o antecedem. */
export function statements(sql) {
  const out = []; let start = 0, i = 0, dollar = false, quote = false;
  while (i < sql.length) {
    const c = sql[i], two = sql.slice(i, i + 2);
    if (!dollar && !quote && two === "--") { i = sql.indexOf("\n", i); if (i < 0) i = sql.length; continue; }
    if (!quote && two === "$$") { dollar = !dollar; i += 2; continue; }
    if (!dollar && c === "'") { quote = !quote; i++; continue; }
    if (!dollar && !quote && c === ";") { out.push(sql.slice(start, i + 1)); start = i + 1; }
    i++;
  }
  const rest = sql.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

const lines = (s) => s.split("\n").length;
export function chunk(stmts, max = 110) {
  const groups = []; let cur = [], n = 0;
  for (const s of stmts) {
    const size = lines(s);
    // abre um novo passo antes de um comentário de seção, se o atual já tem um bom tamanho
    const section = /^\s*(--[^\n]*\n\s*)*--\s*=====/.test(s);
    if (cur.length && (n + size > max || (section && n > max * 0.5))) { groups.push(cur); cur = []; n = 0; }
    cur.push(s); n += size;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

if (process.argv[1].endsWith("split-rollout.mjs")) {
  let num = Number(process.argv[2]); const files = process.argv.slice(3);
  for (const f of files) {
    const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
    const groups = chunk(statements(sql), Number(process.env.MAX_LINES) || 110);
    groups.forEach((g, k) => {
      const body = g.map((s) => s.replace(/^\n+/, "")).join("\n\n");
      const head = `-- PASSO ${num}: ${f.replace(/\.sql$/, "")} — parte ${k + 1} de ${groups.length}\n-- Rode este arquivo inteiro, sozinho, no SQL Editor. Pode rodar de novo sem problema.\n`;
      writeFileSync(`supabase/rollout/passo-${num}.sql`, head + body.trim() + "\n");
      console.log(`passo-${num}.sql`, lines(body), "linhas");
      num++;
    });
  }
}
