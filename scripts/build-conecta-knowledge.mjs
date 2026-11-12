// Gera supabase/functions/conecta/knowledge.js a partir dos textos oficiais do app (normas, termos, FAQ, mapa de telas).
// Uso: node scripts/build-conecta-knowledge.mjs [--check]   (--check falha se o arquivo gerado estiver desatualizado)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";

const load = async (path) => {
  const js = transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "esm" }).code;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
};
const inst = await load("src/content/institutional.ts");
const faq = await load("src/content/faq.ts");
const scr = await load("src/content/screens.ts");

const pageText = (p) => [`## ${p.title}`, p.summary, ...p.sections.flatMap((s) => [s.heading ? `### ${s.heading}` : "", ...(s.paragraphs ?? []), ...(s.bullets ?? []).map((b) => `- ${b}`)])].filter(Boolean).join("\n");
const out = [
  "# Perguntas frequentes", ...faq.FAQ.map((f) => `P: ${f.q}\nR: ${f.a}`),
  "# Mapa de telas", ...scr.SCREENS.map((s) => `- ${s.name} (${s.path}) [${s.audience ?? "todos"}]: ${s.what}`),
  "# Documentos oficiais (versão preliminar, sujeita a revisão jurídica)", ...inst.INFO_PAGES.map(pageText),
].join("\n\n");

const file = `// GERADO por scripts/build-conecta-knowledge.mjs — não edite à mão.\nexport const KNOWLEDGE = ${JSON.stringify(out)};\nexport const SCREEN_PATHS = ${JSON.stringify(scr.SCREEN_PATHS)};\n`;
const target = "supabase/functions/conecta/knowledge.js";
if (process.argv.includes("--check")) {
  if (!existsSync(target) || readFileSync(target, "utf8") !== file) { console.error("knowledge.js desatualizado: rode node scripts/build-conecta-knowledge.mjs"); process.exit(1); }
  console.log("knowledge.js em dia");
} else { writeFileSync(target, file); console.log("gerado", out.length, "caracteres"); }
