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

/** Filete com losango ao centro, usado como separador. */
function divider(ctx: CanvasRenderingContext2D, cx: number, y: number, half: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, y); ctx.lineTo(cx - 22, y);
  ctx.moveTo(cx + 22, y); ctx.lineTo(cx + half, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y - 8); ctx.lineTo(cx + 8, y); ctx.lineTo(cx, y + 8); ctx.lineTo(cx - 8, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Cartão 1080×1350 (formato de post), tudo centralizado: marca no topo, foto da casa (ou monograma), nome, descrição e QR
 * em uma placa branca na base. Desenhado no aparelho; nada é enviado.
 */
export function drawShareCard(canvas: HTMLCanvasElement, opts: { name: string; text: string; link: string; style: CardStyleId; photo?: HTMLImageElement | null }) {
  const st = CARD_STYLES.find((s) => s.id === opts.style) ?? CARD_STYLES[0];
  const W = 1080, H = 1350, CX = W / 2;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, st.bg[0]);
  g.addColorStop(1, st.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // brilho suave atrás do conteúdo
  const glow = ctx.createRadialGradient(CX, 420, 40, CX, 420, 700);
  glow.addColorStop(0, st.accent + "26");
  glow.addColorStop(1, st.accent + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // moldura dupla
  ctx.strokeStyle = st.accent + "88";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = st.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // marca
  ctx.fillStyle = st.accent;
  ctx.font = "700 30px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("I L Ê   C O N E C T A", CX, 138);
  divider(ctx, CX, 168, 150, st.accent);

  const photo = opts.photo && opts.photo.width > 0 ? opts.photo : null;
  let y: number;
  if (photo) {
    const bw = 760, bh = 300, bx = (W - bw) / 2, by = 210;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = st.bg[1];
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 36); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 36); ctx.clip();
    const k = Math.max(bw / photo.width, bh / photo.height);
    ctx.drawImage(photo, bx + (bw - photo.width * k) / 2, by + (bh - photo.height * k) / 2, photo.width * k, photo.height * k);
    ctx.restore();
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 36); ctx.stroke();
    y = by + bh + 100;
  } else {
    const r = 120, cy = 360;
    ctx.fillStyle = st.accent + "26";
    ctx.beginPath(); ctx.arc(CX, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(CX, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(CX, cy, r + 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = st.accent;
    ctx.font = "700 130px 'Fraunces', Georgia, serif";
    ctx.fillText((Array.from(opts.name.trim())[0] ?? "I").toUpperCase(), CX, cy + 46);
    y = cy + r + 130;
  }

  // nome
  ctx.fillStyle = st.ink;
  let nameSize = photo ? 76 : 84;
  const fits = () => { ctx.font = `700 ${nameSize}px 'Fraunces', Georgia, serif`; return ctx.measureText(opts.name).width <= W - 220; };
  while (nameSize > 52 && !fits()) nameSize -= 4;
  ctx.font = `700 ${nameSize}px 'Fraunces', Georgia, serif`;
  const nameLines = wrap(ctx, opts.name, W - 220, 2);
  nameLines.forEach((l, i) => ctx.fillText(l, CX, y + i * (nameSize + 10)));
  y += (nameLines.length - 1) * (nameSize + 10);

  // separador e descrição
  divider(ctx, CX, y + 42, 90, st.accent);
  ctx.fillStyle = st.sub;
  const dSize = 36, dLine = 48;
  ctx.font = `500 ${dSize}px 'DM Sans', system-ui, sans-serif`;
  const text = opts.text.trim() || "Conheça a casa e fale com ela";
  const desc = wrap(ctx, text, W - 280, photo ? 2 : 3);
  desc.forEach((l, i) => ctx.fillText(l, CX, y + 106 + i * dLine));
  y += 106 + (desc.length - 1) * dLine;

  // QR em placa branca, ancorado na base
  const m = makeQr(opts.link);
  const n = m.length;
  const pad = 22;
  const bottom = 1188;
  const plateMax = Math.min(420, bottom - (y + 50));
  const box = Math.max(250, plateMax);
  const cell = Math.max(3, Math.floor((box - pad * 2) / (n + 2)));
  const real = cell * (n + 2) + pad * 2;
  const qx = (W - real) / 2, qy = bottom - real;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.roundRect(qx, qy, real, real, 28); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#1b1411";
  m.forEach((row, yy) => row.forEach((on, x) => on && ctx.fillRect(qx + pad + (x + 1) * cell, qy + pad + (yy + 1) * cell, cell, cell)));

  ctx.fillStyle = st.accent;
  ctx.font = "700 28px 'DM Sans', system-ui, sans-serif";
  ctx.fillText("A P O N T E   A   C Â M E R A   P A R A   A B R I R", CX, bottom + 54);
}
