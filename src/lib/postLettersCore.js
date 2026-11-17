// "Letras com a sua identidade" (parte dos Posts com a cara da sua casa, Blueprint §16/§18.1): fonte, tamanho, cor, alinhamento, posição, negrito e itálico.
// Tudo vem de uma lista fechada: o banco guarda só a escolha (ex.: font "ritual", color "dourado"), nunca estilo escrito à mão. Assim ninguém injeta nada
// e as combinações ilegíveis nem existem: sobre a foto só cores claras (com o véu calculado para a cor), sobre o papel do card só cores escuras.
import { relLuminance, scrimAlpha, MIN_CONTRAST } from "./postCardCore.js";

export const FONTS = [
  { id: "classica", label: "Clássica", family: "'Fraunces', Georgia, serif", scale: 1, weight: 500, bold: 700 },
  { id: "moderna", label: "Moderna", family: "'DM Sans', system-ui, sans-serif", scale: 1, weight: 500, bold: 700 },
  { id: "elegante", label: "Elegante", family: "'Cormorant Garamond', Georgia, serif", scale: 1.14, weight: 600, bold: 700 },
  { id: "manuscrita", label: "Manuscrita", family: "'Dancing Script', cursive", scale: 1.2, weight: 600, bold: 700 },
  { id: "ritual", label: "Ritual", family: "'Cinzel', Georgia, serif", scale: 0.92, weight: 600, bold: 700 },
];
export const SIZES = [
  { id: "p", label: "Pequeno", total: 15, parcial: 14 },
  { id: "m", label: "Médio", total: 18, parcial: 16 },
  { id: "g", label: "Grande", total: 26, parcial: 22 },
];
// sobre a foto (com véu escuro atrás): cores claras
export const COLORS_TOTAL = [
  { id: "branco", label: "Branco", hex: "#FFFFFF" },
  { id: "creme", label: "Creme", hex: "#FFF1D0" },
  { id: "dourado", label: "Dourado", hex: "#F5D06F" },
  { id: "rosa", label: "Rosa", hex: "#FFD3DD" },
  { id: "verdeclaro", label: "Verde-claro", hex: "#CDEFD9" },
  { id: "azulclaro", label: "Azul-claro", hex: "#D3E6FF" },
];
// sobre o papel claro do card (foto em cima, texto embaixo): cores escuras
export const PAPER = "#FBF7EE";
export const COLORS_PARCIAL = [
  { id: "preto", label: "Preto", hex: "#1A1A1A" },
  { id: "floresta", label: "Verde-floresta", hex: "#14543F" },
  { id: "vinho", label: "Vinho", hex: "#7A1F3D" },
  { id: "marrom", label: "Marrom", hex: "#5A3A1E" },
  { id: "marinho", label: "Azul-marinho", hex: "#1F3A63" },
  { id: "roxo", label: "Roxo", hex: "#4B2A6B" },
];
export const ALIGNS = [
  { id: "esq", label: "À esquerda" },
  { id: "centro", label: "Centralizado" },
  { id: "dir", label: "À direita" },
];
export const POSITIONS = [
  { id: "topo", label: "No alto" },
  { id: "meio", label: "No meio" },
  { id: "base", label: "Embaixo" },
];

export const EMPTY_LETTERS = { font: null, size: null, color: null, align: null, pos: null, bold: false, italic: false };
const ids = (l) => l.map((x) => x.id);
const pick = (v, list) => (typeof v === "string" && ids(list).includes(v) ? v : null);
const by = (list, id) => list.find((x) => x.id === id);

export const colorsFor = (mode) => (mode === "parcial" ? COLORS_PARCIAL : mode === "total" ? COLORS_TOTAL : []);

/** Qualquer coisa vira letras válidas (o que não for reconhecido volta ao padrão). */
export function normalizeLetters(x) {
  const o = x && typeof x === "object" ? x : {};
  return {
    font: pick(o.font, FONTS), size: pick(o.size, SIZES), color: pick(o.color, [...COLORS_TOTAL, ...COLORS_PARCIAL]),
    align: pick(o.align, ALIGNS), pos: pick(o.pos, POSITIONS), bold: o.bold === true, italic: o.italic === true,
  };
}
/** Ajusta as letras ao modo do card: cor que não vale no modo e posição do card parcial caem. Modo normal não tem letras. */
export function fitToMode(letters, mode) {
  const l = normalizeLetters(letters);
  if (mode !== "total" && mode !== "parcial") return { ...EMPTY_LETTERS };
  if (l.color && !ids(colorsFor(mode)).includes(l.color)) l.color = null;
  if (mode === "parcial") l.pos = null;
  return l;
}
export const isDefaultLetters = (letters) => JSON.stringify(normalizeLetters(letters)) === JSON.stringify(EMPTY_LETTERS);

/** Colunas do banco (card_font, card_size, ...). */
export function lettersToColumns(letters) {
  const l = normalizeLetters(letters);
  return { card_font: l.font, card_size: l.size, card_color: l.color, card_align: l.align, card_pos: l.pos, card_bold: l.bold, card_italic: l.italic };
}
export function lettersFromRow(row) {
  const r = row && typeof row === "object" ? row : {};
  return normalizeLetters({ font: r.card_font, size: r.card_size, color: r.card_color, align: r.card_align, pos: r.card_pos, bold: r.card_bold, italic: r.card_italic });
}

const hexLum = (hex) => { const n = parseInt(hex.slice(1), 16); return relLuminance((n >> 16) & 255, (n >> 8) & 255, n & 255); };
/** Força do véu (35 a 85 %) para a cor escolhida ler bem no ponto mais claro da foto. Sem cor escolhida, o texto é branco. */
export function scrimPctFor(brightness, colorId) {
  const c = by(COLORS_TOTAL, colorId);
  return Math.round(scrimAlpha(brightness, MIN_CONTRAST, c ? hexLum(c.hex) : 1) * 100);
}
export { hexLum };

/** O que o desenho do card precisa: família, tamanho em px, peso, estilo, cor e alinhamento. `null` = padrão do card. */
export function lettersLook(letters, mode) {
  const l = fitToMode(letters, mode);
  const font = by(FONTS, l.font) ?? null;
  const size = by(SIZES, l.size) ?? null;
  const color = by(colorsFor(mode), l.color) ?? null;
  const base = mode === "parcial" ? (size ? size.parcial : null) : size ? size.total : null;
  return {
    custom: !isDefaultLetters(l),
    family: font ? font.family : null,
    fontSizePx: base === null ? (font && font.scale !== 1 ? (mode === "parcial" ? 15 : 17) * font.scale : null) : Math.round(base * (font ? font.scale : 1) * 10) / 10,
    weight: l.bold ? (font ? font.bold : 700) : font ? font.weight : null,
    italic: l.italic,
    color: color ? color.hex : null,
    align: l.align, pos: l.pos,
  };
}
