// Editor de Momentos (18/11/2026): matemática pura do enquadramento e das camadas de texto/emoji. Sem tela, sem navegador:
// o desenho (canvas) usa estas funções, e os testes conferem tudo aqui.

export const OUT_W = 1080;
export const OUT_H = 1920;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const TEXT_MAX = 80;
export const LAYERS_MAX = 10;
export const SIZE_MIN = 0.04;
export const SIZE_MAX = 0.3;
export const TEXT_SIZE_DEFAULT = 0.085;
export const EMOJI_SIZE_DEFAULT = 0.16;

/** Fontes curadas (as três de letra vêm junto com o app; "moderna" usa a do próprio aparelho). */
export const EDIT_FONTS = [
  { key: "moderna", label: "Moderna", family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weight: 700 },
  { key: "classica", label: "Clássica", family: '"Cormorant Garamond", Georgia, serif', weight: 700 },
  { key: "manuscrita", label: "Manuscrita", family: '"Dancing Script", cursive', weight: 700 },
  { key: "gravada", label: "Gravada", family: '"Cinzel", Georgia, serif', weight: 700 },
];
export const EDIT_COLORS = [
  { hex: "#FFFFFF", label: "Branco" }, { hex: "#111111", label: "Preto" }, { hex: "#F5C542", label: "Dourado" }, { hex: "#E8503A", label: "Vermelho" },
  { hex: "#3AA876", label: "Verde" }, { hex: "#3A8DE8", label: "Azul" }, { hex: "#B565E8", label: "Roxo" }, { hex: "#F28CB1", label: "Rosa" },
];
export const EDIT_EMOJIS = ["🙏", "✨", "🔥", "🌿", "🕯️", "🌹", "💛", "🌊", "🕊️", "🌙", "☀️", "⭐", "❤️", "🙌", "💫", "🌺", "🥁", "🍃", "🌸", "🔱", "🧿", "📿", "🪔", "🤍", "💜", "🌟", "🎶", "🎉", "🥰", "🌈", "🍀", "🪘"];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export const defaultFrame = () => ({ scale: 1, cx: 0.5, cy: 0.5 });
export const isDefaultFrame = (f) => !f || (Math.abs(num(f.scale, 1) - 1) < 1e-6 && Math.abs(num(f.cx, 0.5) - 0.5) < 1e-6 && Math.abs(num(f.cy, 0.5) - 0.5) < 1e-6);

/** Retângulo (em pixels do palco W x H) onde a foto iw x ih é desenhada. scale 1 = foto inteira visível. */
export function imageRect(iw, ih, W, H, frame) {
  const s = Math.min(W / iw, H / ih) * clamp(num(frame?.scale, 1), ZOOM_MIN, ZOOM_MAX);
  const w = iw * s, h = ih * s;
  return { x: num(frame?.cx, 0.5) * W - w / 2, y: num(frame?.cy, 0.5) * H - h / 2, w, h };
}

/** Escala que faz a foto preencher o palco inteiro (sem sobras), limitada ao zoom máximo. */
export function coverScale(iw, ih, W, H) {
  const contain = Math.min(W / iw, H / ih);
  const cover = Math.max(W / iw, H / ih);
  return clamp(cover / contain, ZOOM_MIN, ZOOM_MAX);
}

/** Mantém a foto dentro do palco: depois de aproximar, não deixa buraco; antes, não deixa a foto sair da tela. */
export function clampFrame(iw, ih, W, H, frame) {
  const scale = clamp(num(frame?.scale, 1), ZOOM_MIN, ZOOM_MAX);
  const r = imageRect(iw, ih, W, H, { ...frame, scale });
  const range = (size, total) => (size <= total ? [size / 2 / total, 1 - size / 2 / total] : [1 - size / 2 / total, size / 2 / total]);
  const [x0, x1] = range(r.w, W), [y0, y1] = range(r.h, H);
  return { scale, cx: clamp(num(frame?.cx, 0.5), x0, x1), cy: clamp(num(frame?.cy, 0.5), y0, y1) };
}

/** Pinça: novo valor a partir da distância inicial e atual entre os dedos. */
export function pinchValue(start, startDist, dist, min, max) {
  if (!(startDist > 0) || !(dist > 0)) return clamp(num(start, min), min, max);
  return clamp(start * (dist / startDist), min, max);
}

const FONT_KEYS = EDIT_FONTS.map((f) => f.key);
const HEX = /^#[0-9A-Fa-f]{6}$/;
let seq = 0;
export const newLayerId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Remove controles/quebras duplicadas e limita o tamanho. Emoji e acentos passam. */
export function cleanText(raw) {
  return String(raw ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\n{3,}/g, "\n\n").slice(0, TEXT_MAX);
}

export function makeLayer(kind, text, opts = {}) {
  const emoji = kind === "emoji";
  return sanitizeLayer({
    id: opts.id ?? newLayerId(), kind: emoji ? "emoji" : "text", text,
    font: opts.font ?? "moderna", color: opts.color ?? "#FFFFFF", size: opts.size ?? (emoji ? EMOJI_SIZE_DEFAULT : TEXT_SIZE_DEFAULT),
    x: opts.x ?? 0.5, y: opts.y ?? (emoji ? 0.4 : 0.5),
  });
}

export function sanitizeLayer(l) {
  if (!l || typeof l !== "object") return null;
  const kind = l.kind === "emoji" ? "emoji" : "text";
  const text = cleanText(l.text);
  if (!text.trim()) return null;
  return {
    id: typeof l.id === "string" && l.id ? l.id.slice(0, 40) : newLayerId(), kind, text: kind === "emoji" ? text.replace(/\s+/g, "").slice(0, 8) : text,
    font: FONT_KEYS.includes(l.font) ? l.font : "moderna", color: typeof l.color === "string" && HEX.test(l.color) ? l.color.toUpperCase() : "#FFFFFF",
    size: clamp(num(l.size, TEXT_SIZE_DEFAULT), SIZE_MIN, SIZE_MAX), x: clamp(num(l.x, 0.5), 0.02, 0.98), y: clamp(num(l.y, 0.5), 0.02, 0.98),
  };
}

export function sanitizeLayers(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeLayer).filter(Boolean).slice(0, LAYERS_MAX);
}

/** Quebra o texto em linhas que cabem em maxWidth. measure(str) devolve a largura. Palavra maior que a linha é partida. */
export function wrapLines(text, maxWidth, measure) {
  const lines = [];
  for (const para of String(text ?? "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let cur = "";
    for (let w of words) {
      while (measure(w) > maxWidth && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && measure(w.slice(0, cut)) > maxWidth) cut--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, cut)); w = w.slice(cut);
      }
      const next = cur ? `${cur} ${w}` : w;
      if (cur && measure(next) > maxWidth) { lines.push(cur); cur = w; } else cur = next;
    }
    lines.push(cur);
  }
  return lines.slice(0, 12);
}

export const hitLayer = (boxes, px, py) => { for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id; } return null; };
