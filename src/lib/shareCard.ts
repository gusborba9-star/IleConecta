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
  return lines.slice(0, maxLines);
}

/** Cartão 1080×1350 (formato de post) com nome da casa e QR do link de divulgação. Tudo desenhado no aparelho. */
export function drawShareCard(canvas: HTMLCanvasElement, opts: { name: string; place: string; link: string; style: CardStyleId }) {
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
  ctx.font = "700 30px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("I L Ê   C O N E C T A", W / 2, 150);

  ctx.fillStyle = st.ink;
  ctx.font = "700 92px 'Fraunces', Georgia, serif";
  const lines = wrap(ctx, opts.name, W - 200, 3);
  const top = 330 - ((lines.length - 1) * 56);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * 108));
  const afterName = top + (lines.length - 1) * 108;

  ctx.fillStyle = st.sub;
  ctx.font = "500 38px 'DM Sans', system-ui, sans-serif";
  if (opts.place) ctx.fillText(opts.place, W / 2, afterName + 80);
  ctx.fillText("Conheça a casa e fale com ela", W / 2, afterName + (opts.place ? 140 : 90));

  const m = makeQr(opts.link);
  const n = m.length;
  const size = 440, pad = 28, cell = Math.floor(size / (n + 2));
  const box = cell * (n + 2) + pad * 2;
  const bx = (W - box) / 2, by = 760;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(bx, by, box, box, 28);
  ctx.fill();
  ctx.fillStyle = "#1b1411";
  m.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(bx + pad + (x + 1) * cell, by + pad + (y + 1) * cell, cell, cell)));

  ctx.fillStyle = st.sub;
  ctx.font = "500 32px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("Aponte a câmera para abrir", W / 2, by + box + 70);
}
