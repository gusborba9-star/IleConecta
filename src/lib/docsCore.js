// Documentos da plataforma (painel admin): leitor simples de Markdown e validação.
// Sem HTML cru: o resultado é uma lista de blocos que a tela monta com elementos React.

export const DOC_TITLE_MAX = 80;
export const DOC_BODY_MAX = 60000;

/** "Regras por recurso" -> "regras-por-recurso" (sem acentos). */
export function slugify(title) {
  return String(title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function validateDoc(input) {
  const title = String(input?.title ?? "").trim();
  const body = String(input?.body ?? "");
  if (!title) return { ok: false, error: "Dê um título ao documento." };
  if (title.length > DOC_TITLE_MAX) return { ok: false, error: `O título pode ter até ${DOC_TITLE_MAX} caracteres.` };
  if (body.length > DOC_BODY_MAX) return { ok: false, error: `O texto pode ter até ${DOC_BODY_MAX.toLocaleString("pt-BR")} caracteres.` };
  return { ok: true, title, body };
}

/** Texto com **negrito** e `código` -> pedaços { t: "text" | "b" | "code", v }. */
export function parseInline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { t: "b", v: m[1] } : { t: "code", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

/** Markdown -> blocos: h, p, list, table, hr. */
export function parseBlocks(md) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2].trim() }); i++; continue; }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }

    if (line.trim().startsWith("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const m = LIST_RE.exec(lines[i]);
        const depth = Math.min(3, Math.floor(m[1].length / 2));
        const ordered = /\d/.test(m[2]);
        items.push({ depth, marker: ordered && depth === 0 ? m[2] : "•", text: m[3].trim() });
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !LIST_RE.test(lines[i]) && !lines[i].trim().startsWith("|")) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    else i++;
  }
  return blocks;
}
