// Desenho do editor de Momentos. O MESMO código desenha a prévia (palco pequeno) e a imagem final (1080 x 1920),
// então o que a casa vê na tela é exatamente o que as pessoas vão ver.
import "@/lib/postFonts";
import { EDIT_FONTS, OUT_H, OUT_W, imageRect, wrapLines, type EditFrame, type EditLayer, type LayerBox } from "@/lib/momentEditCore";

export type Src = ImageBitmap | HTMLCanvasElement | HTMLImageElement;
const srcW = (s: Src) => ("naturalWidth" in s && s.naturalWidth ? s.naturalWidth : s.width);
const srcH = (s: Src) => ("naturalHeight" in s && s.naturalHeight ? s.naturalHeight : s.height);
export const sourceSize = (s: Src) => ({ w: srcW(s), h: srcH(s) });

const fontOf = (key: string) => EDIT_FONTS.find((f) => f.key === key) ?? EDIT_FONTS[0];
export const fontCss = (key: string, px: number) => { const f = fontOf(key); return `${f.weight} ${px}px ${f.family}`; };

/** Fundo desfocado: reduz a foto a um tiquinho e estica de volta (não depende de ctx.filter, que o Safari não tem). */
function drawBackdrop(ctx: CanvasRenderingContext2D, src: Src, W: number, H: number) {
  const iw = srcW(src), ih = srcH(src);
  const t = document.createElement("canvas");
  t.width = 18; t.height = Math.max(8, Math.round(18 * (H / W)));
  const tc = t.getContext("2d");
  if (!tc) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H); return; }
  const cover = Math.max(t.width / iw, t.height / ih);
  tc.drawImage(src, (t.width - iw * cover) / 2, (t.height - ih * cover) / 2, iw * cover, ih * cover);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(t, 0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H);
}

export function layerMetrics(ctx: CanvasRenderingContext2D, l: EditLayer, W: number) {
  const px = l.size * W;
  ctx.font = fontCss(l.kind === "emoji" ? "moderna" : l.font, px);
  const lines = l.kind === "emoji" ? [l.text] : wrapLines(l.text, W * 0.84, (s) => ctx.measureText(s).width);
  const lh = px * 1.2;
  const w = Math.max(...lines.map((s) => ctx.measureText(s).width), px * 0.6);
  return { px, lines, lh, w, h: lines.length * lh };
}

export function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, src: Src, frame: EditFrame, layers: EditLayer[], opts: { selectedId?: string | null } = {}): LayerBox[] {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, src, W, H);
  const r = imageRect(srcW(src), srcH(src), W, H, frame);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, r.x, r.y, r.w, r.h);
  const boxes: LayerBox[] = [];
  for (const l of layers) {
    const m = layerMetrics(ctx, l, W);
    const cx = l.x * W, top = l.y * H - m.h / 2;
    ctx.font = fontCss(l.kind === "emoji" ? "moderna" : l.font, m.px);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = l.color;
    if (l.kind === "text") { ctx.shadowColor = l.color.toUpperCase() === "#111111" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.55)"; ctx.shadowBlur = m.px * 0.18; ctx.shadowOffsetY = m.px * 0.04; }
    m.lines.forEach((line, i) => ctx.fillText(line, cx, top + m.lh * (i + 0.5)));
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const pad = m.px * 0.15;
    boxes.push({ id: l.id, x: cx - m.w / 2 - pad, y: top - pad, w: m.w + pad * 2, h: m.h + pad * 2 });
  }
  if (opts.selectedId) {
    const b = boxes.find((x) => x.id === opts.selectedId);
    if (b) { ctx.setLineDash([W * 0.012, W * 0.012]); ctx.lineWidth = Math.max(1.5, W * 0.004); ctx.strokeStyle = "#FFFFFF"; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]); }
  }
  ctx.restore();
  return boxes;
}

/** Garante que as fontes escolhidas já carregaram antes de desenhar (senão a imagem final sairia com letra errada). */
export async function ensureFonts(layers: EditLayer[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const keys = new Set(layers.filter((l) => l.kind === "text").map((l) => l.font));
  await Promise.all([...keys].map((k) => document.fonts.load(fontCss(k, 40), "Aa Áé").catch(() => [])));
}

/** Imagem final 1080 x 1920 em WebP (JPEG se o aparelho não souber WebP). */
export async function renderFinal(src: Src, frame: EditFrame, layers: EditLayer[]): Promise<Blob | null> {
  await ensureFonts(layers);
  const c = document.createElement("canvas");
  c.width = OUT_W; c.height = OUT_H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  drawScene(ctx, OUT_W, OUT_H, src, frame, layers);
  const webp = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.82));
  if (webp && webp.type === "image/webp") return webp;
  return new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
}
