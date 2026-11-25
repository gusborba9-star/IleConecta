// Impressão digital dos textos jurídicos (aceites + páginas de Termos, Privacidade e Taxas).
// Uso: node scripts/legal-hash.mjs         -> imprime
//      node scripts/legal-hash.mjs --write -> grava tests/fixtures/legal-hash.json (só depois de decidir se a mudança é material ou editorial)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CONSENT_DOCS, DOC_MIN_VERSION } from "../src/lib/legalCore.js";

const SLUGS = ["termos-do-cliente", "termos-da-casa", "privacidade-lgpd", "eventos-e-taxas"];
export function legalFingerprint() {
  const src = readFileSync(new URL("../src/content/institutional.ts", import.meta.url), "utf8");
  const parts = src.split(/\n  \{\n    slug: /).slice(1);
  const pages = SLUGS.map((slug) => {
    const block = parts.find((b) => b.startsWith(`"${slug}"`));
    if (!block) throw new Error(`página ${slug} não encontrada`);
    return `${slug}\n${block}`;
  });
  const consents = Object.keys(CONSENT_DOCS).sort().map((k) => `${k}\n${CONSENT_DOCS[k].text}`);
  const h = createHash("sha256").update([...consents, ...pages].join("\n=====\n")).digest("hex");
  return { hash: h, minVersion: DOC_MIN_VERSION };
}
if (process.argv[1] && process.argv[1].endsWith("legal-hash.mjs")) {
  const fp = legalFingerprint();
  if (process.argv.includes("--write")) {
    mkdirSync(new URL("../tests/fixtures/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../tests/fixtures/legal-hash.json", import.meta.url), JSON.stringify(fp, null, 2) + "\n");
  }
  console.log(JSON.stringify(fp, null, 2));
}
