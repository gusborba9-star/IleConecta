// Categorias da publicação (Giras e eventos, Avisos, Ensinamentos) e os filtros do Início. Sem React: testável.
export const CATEGORIES = [
  { id: "evento", label: "Giras e eventos" },
  { id: "aviso", label: "Avisos" },
  { id: "ensinamento", label: "Ensinamentos" },
];
const IDS = new Set(["geral", ...CATEGORIES.map((c) => c.id)]);
export function normalizeCategory(v) {
  return typeof v === "string" && IDS.has(v) ? v : "geral";
}
export function categoryLabel(v) {
  return CATEGORIES.find((c) => c.id === v)?.label ?? null;
}
const plain = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
/** Mesma cidade (sem acento e sem diferença de maiúsculas). Cidade vazia nunca combina. */
export function sameCity(a, b) {
  const x = plain(a);
  return x !== "" && x === plain(b);
}
/** filter: "todos" | "evento" | "aviso" | "ensinamento" | "perto". */
export function matchesFilter(filter, { category, authorCity, viewerCity }) {
  if (filter === "todos" || !filter) return true;
  if (filter === "perto") return sameCity(authorCity, viewerCity);
  return normalizeCategory(category) === filter;
}
