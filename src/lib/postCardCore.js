// "Posts com a cara da sua casa" (Blueprint §16/§18.1): regras puras do card estilizado das postagens.
// O card é desenhado na tela com o texto como texto (nada de texto "achatado" na imagem); aqui ficam as regras e a conta que garante a leitura.
export const CARD_MODES = [
  { id: "normal", label: "Card normal", desc: "Só o texto, como sempre." },
  { id: "total", label: "Imagem no card todo", desc: "A foto cobre o card e o texto fica por cima, com um fundo suave que garante a leitura." },
  { id: "parcial", label: "Imagem em parte do card", desc: "A foto aparece no alto do card e o texto logo abaixo." },
];
export const CARD_TEXT_MAX = 400; // igual ao limite do banco (0140)
export const POST_TEXT_MAX = 2000;
export const MIN_CONTRAST = 4.5; // WCAG AA para texto normal
const MODE_IDS = CARD_MODES.map((m) => m.id);

/** Qualquer coisa vira um modo válido ("normal" se não reconhecer). */
export function modeId(x) {
  return typeof x === "string" && MODE_IDS.includes(x) ? x : "normal";
}
/** Valor da coluna card_style do banco (vazio = normal). */
export function toColumn(mode) {
  const m = modeId(mode);
  return m === "normal" ? null : m;
}
export function fromColumn(v) {
  return v === "total" || v === "parcial" ? v : "normal";
}

const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
/** Luminância relativa WCAG (0 a 1) de um pixel sRGB. */
export function relLuminance(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
export function contrast(l1, l2) { const [a, b] = l1 >= l2 ? [l1, l2] : [l2, l1]; return (a + 0.05) / (b + 0.05); }

/**
 * "Pior caso" do fundo: o brilho (0 a 255, em sRGB) abaixo do qual ficam 90% dos pixels visíveis.
 * Texto branco precisa ler bem até nas partes mais claras da foto. Sem pixels (foto não lida) = pior caso, 255.
 */
export function sampleBrightness(rgba, percentile = 0.9) {
  if (!rgba || typeof rgba.length !== "number") return 255;
  const v = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 8) continue;
    // o brilho que importa para o olho é o da luminância; volta para a escala 0-255 do sRGB
    const L = relLuminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    v.push(255 * (L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055));
  }
  if (!v.length) return 255;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(percentile * v.length))];
}

export const SCRIM_MIN = 0.35; // sempre há um véu leve atrás do texto (gosto do desenho)
export const SCRIM_MAX = 0.85;
/** Força (0 a 1) do véu escuro atrás do texto branco para o fundo mais claro (`brightness`, 0-255) chegar a contraste AA. */
export function scrimAlpha(brightness, min = MIN_CONTRAST) {
  const b = Number.isFinite(brightness) ? Math.min(255, Math.max(0, brightness)) : 255;
  for (let a = SCRIM_MIN; a <= SCRIM_MAX + 1e-9; a += 0.01) {
    const v = b * (1 - a);
    if (contrast(1, relLuminance(v, v, v)) >= min) return Math.round(a * 100) / 100;
  }
  return SCRIM_MAX;
}

/** Valida o rascunho antes de publicar. `allowed`: o plano inclui a ferramenta. */
export function validateDraft({ text, mode, hasImage, ack, allowed }) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return { ok: false, error: "Escreva algo antes de publicar" };
  if (t.length > POST_TEXT_MAX) return { ok: false, error: `O texto passa de ${POST_TEXT_MAX} caracteres.` };
  const m = modeId(mode);
  if (m === "normal") return { ok: true };
  if (!allowed) return { ok: false, error: "Posts com a cara da sua casa estão disponíveis a partir do plano Profissional." };
  if (!hasImage) return { ok: false, error: "Escolha a imagem do card." };
  if (t.length > CARD_TEXT_MAX) return { ok: false, error: `No card o texto pode ter até ${CARD_TEXT_MAX} caracteres (agora tem ${t.length}).` };
  if (ack !== true) return { ok: false, error: "Confirme que você tem o direito de usar a imagem." };
  return { ok: true };
}
