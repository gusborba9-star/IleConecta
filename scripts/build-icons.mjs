// Desenha os ícones do app (PNG e ICO) por código, sem dependências.
// Roda sozinho antes de `dev` e `build` (ver package.json). Marca: quatro folhas em cruz, rede e nó central.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BG = [14, 59, 44];
const GOLD = [212, 175, 85];
const LIGHT = [244, 220, 146];

// ---- geometria (espaço 512x512, centro em 256,256) ----
const bez = (p0, p1, p2, p3, n = 28) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  });
const rot = (pts, deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};
function shapes() {
  const strokes = []; // { pts, w, color }
  const dots = []; // { x, y, r, color }
  const tips = [];
  for (const a of [-45, 45, 135, 225]) {
    const top = bez([0, 0], [34.76, -53.72], [113.76, -45.662], [158, 0]);
    const bottom = bez([158, 0], [113.76, 45.662], [34.76, 53.72], [0, 0]);
    strokes.push({ pts: rot([...top, ...bottom], a), w: 14, color: GOLD });
    tips.push(rot([[158, 0]], a)[0]);
  }
  strokes.push({ pts: [...tips, tips[0]], w: 5.6, color: [158, 135, 70] });
  for (const [x, y] of tips) dots.push({ x, y, r: 14.7, color: GOLD });
  dots.push({ x: 0, y: 0, r: 23.8, color: LIGHT });
  return { strokes, dots };
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

function render(size, scale) {
  const { strokes, dots } = shapes();
  const k = (size / 512) * scale; // unidades do desenho -> pixels
  const c = size / 2;
  const segs = [];
  for (const s of strokes)
    for (let i = 0; i + 1 < s.pts.length; i++)
      segs.push([c + s.pts[i][0] * k, c + s.pts[i][1] * k, c + s.pts[i + 1][0] * k, c + s.pts[i + 1][1] * k, (s.w * k) / 2, s.color]);
  const ds = dots.map((d) => [c + d.x * k, c + d.y * k, d.r * k, d.color]);
  const SS = size >= 128 ? 3 : 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          let col = BG;
          for (const s of segs) {
            if (segDist(px, py, s[0], s[1], s[2], s[3]) <= s[4]) col = s[5];
          }
          for (const d of ds) if ((px - d[0]) ** 2 + (py - d[1]) ** 2 <= d[2] * d[2]) col = d[3];
          r += col[0]; g += col[1]; b += col[2];
        }
      const n = SS * SS, o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  return png(size, raw);
}

// ---- codificador PNG mínimo (RGB 8 bits) ----
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(pub, { recursive: true });
const icon512 = render(512, 0.95);
writeFileSync(join(pub, "icon-512.png"), icon512);
writeFileSync(join(pub, "icon-192.png"), render(192, 0.95));
writeFileSync(join(pub, "apple-touch-icon.png"), render(180, 0.95));
const fav = render(32, 1.15);
writeFileSync(join(pub, "favicon-32.png"), fav);

// favicon.ico com o PNG de 32px embutido
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); // tipo ICO, 1 imagem
head[6] = 32; head[7] = 32; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(fav.length, 14); head.writeUInt32LE(22, 18);
writeFileSync(join(pub, "favicon.ico"), Buffer.concat([head, fav]));
