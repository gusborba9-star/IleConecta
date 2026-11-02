import { makeQr } from "@/lib/qr";

export const CARD_STYLES = [
  { id: "folha", label: "Folha", bg: ["#14543F", "#0F3B2D"], ink: "#FFFFFF", sub: "#BFD6CA", accent: "#E3BF5A" },
  { id: "marfim", label: "Marfim", bg: ["#FBF7EF", "#F3EBDB"], ink: "#2B1A10", sub: "#6B5A4D", accent: "#C99A2E" },
  { id: "terra", label: "Terra", bg: ["#C0391C", "#8E2610"], ink: "#FFFFFF", sub: "#F6D9CF", accent: "#F4DC92" },
] as const;
export type CardStyleId = (typeof CARD_STYLES)[number]["id"];

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const cut = lines.slice(0, maxLines);
  let last = cut[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
  cut[maxLines - 1] = `${last.trimEnd()}…`;
  return cut;
}

/** Cartão 1080×1350 (formato de post): foto opcional, nome, descrição e QR do link. Tudo desenhado no aparelho; nada é enviado. */
export function drawShareCard(canvas: HTMLCanvasElement, opts: { name: string; text: string; link: string; style: CardStyleId; photo?: HTMLImageElement | null }) {
  const st = CARD_STYLES.find((s) => s.id === opts.style) ?? CARD_STYLES[0];
  const W = 1080, H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, st.bg[0]);
  g.addColorStop(1, st.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = st.accent + "22";
  for (let y = 40; y < H; y += 40) for (let x = 40; x < W; x += 40) ctx.fillRect(x, y, 2, 2);
  ctx.strokeStyle = st.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.textAlign = "center";
  ctx.fillStyle = st.accent;
  ctx.font = "700 28px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("I L Ê   C O N E C T A", W / 2, 120);

  let y = 300;
  const photo = opts.photo;
  if (photo && photo.width > 0) {
    const bx = 120, by = 160, bw = W - 240, bh = 420;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 32);
    ctx.clip();
    const k = Math.max(bw / photo.width, bh / photo.height);
    ctx.drawImage(photo, bx + (bw - photo.width * k) / 2, by + (bh - photo.height * k) / 2, photo.width * k, photo.height * k);
    ctx.restore();
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 32);
    ctx.stroke();
    y = by + bh + 100;
  }

  ctx.fillStyle = st.ink;
  let nameSize = photo ? 72 : 92;
  const fits = () => { ctx.font = `700 ${nameSize}px 'Fraunces', Georgia, serif`; return ctx.measureText(opts.name).width <= (W - 200) * 2 * 0.9; };
  while (nameSize > 48 && !fits()) nameSize -= 4;
  ctx.font = `700 ${nameSize}px 'Fraunces', Georgia, serif`;
  const nameLines = wrap(ctx, opts.name, W - 200, 2);
  nameLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * (nameSize + 12)));
  y += (nameLines.length - 1) * (nameSize + 12);

  ctx.fillStyle = st.sub;
  const dSize = photo ? 34 : 38, dLine = photo ? 44 : 50;
  ctx.font = `500 ${dSize}px 'DM Sans', system-ui, sans-serif`;
  const text = opts.text.trim() || "Conheça a casa e fale com ela";
  const desc = wrap(ctx, text, W - 240, photo ? 3 : 4);
  desc.forEach((l, i) => ctx.fillText(l, W / 2, y + 64 + i * dLine));
  y += 64 + (desc.length - 1) * dLine;

  const m = makeQr(opts.link);
  const n = m.length;
  const pad = 24;
  const boxMax = 1232 - (y + 40);
  const box = Math.max(220, Math.min(photo ? 460 : 580, boxMax));
  const cell = Math.max(3, Math.floor((box - pad * 2) / (n + 2)));
  const real = cell * (n + 2) + pad * 2;
  const bx = (W - real) / 2, by = Math.max(y + 40, 1232 - real);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(bx, by, real, real, 28);
  ctx.fill();
  ctx.fillStyle = "#1b1411";
  m.forEach((row, yy) => row.forEach((on, x) => on && ctx.fillRect(bx + pad + (x + 1) * cell, by + pad + (yy + 1) * cell, cell, cell)));

  ctx.fillStyle = st.sub;
  ctx.font = "500 30px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("Aponte a câmera para abrir", W / 2, Math.min(by + real + 50, 1282));
}
