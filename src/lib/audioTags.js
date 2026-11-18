/** Lê título e artista gravados dentro de um MP3 (ID3v2.3/2.4 no começo; ID3v1 no fim). Nunca lança erro: sem etiqueta, devolve campos vazios. */
const clean = (s) => String(s ?? "").replace(/\u0000/g, " ").replace(/[\u0001-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

function decode(bytes, enc) {
  try {
    if (enc === 1) {
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
      return new TextDecoder("utf-16le").decode(bytes);
    }
    if (enc === 2) return new TextDecoder("utf-16be").decode(bytes);
    if (enc === 3) return new TextDecoder("utf-8").decode(bytes);
    return new TextDecoder("iso-8859-1").decode(bytes);
  } catch { return ""; }
}

const synchsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

/** @param {Uint8Array} head primeiros bytes do arquivo  @param {Uint8Array} [tail] últimos 128 bytes */
export function readId3(head, tail) {
  const out = { title: "", author: "" };
  try {
    if (head && head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const ver = head[3], size = synchsafe(head, 6), end = Math.min(head.length, 10 + size);
      let o = 10;
      if (head[5] & 0x40) { const ext = ver === 4 ? synchsafe(head, o) : ((head[o] << 24) | (head[o + 1] << 16) | (head[o + 2] << 8) | head[o + 3]); o += Math.max(0, ext); }
      while (o + 10 <= end && (ver === 3 || ver === 4)) {
        const id = String.fromCharCode(head[o], head[o + 1], head[o + 2], head[o + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const fsize = ver === 4 ? synchsafe(head, o + 4) : ((head[o + 4] << 24) | (head[o + 5] << 16) | (head[o + 6] << 8) | head[o + 7]) >>> 0;
        const start = o + 10, stop = start + fsize;
        if (fsize <= 0 || stop > end) break;
        if (id === "TIT2" || id === "TPE1") {
          const v = clean(decode(head.subarray(start + 1, stop), head[start]));
          if (id === "TIT2" && v) out.title = v; else if (id === "TPE1" && v) out.author = v;
        }
        o = stop;
      }
    }
    if ((!out.title || !out.author) && tail && tail.length >= 128) {
      const t = tail.subarray(tail.length - 128);
      if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
        const f = (a, b) => clean(decode(t.subarray(a, b), 0));
        if (!out.title) out.title = f(3, 33);
        if (!out.author) out.author = f(33, 63);
      }
    }
  } catch { /* etiqueta ilegível: segue sem preencher */ }
  return out;
}

/** Lê as etiquetas de um File de MP3 (só os trechos necessários). */
export async function readFileTags(file) {
  try {
    if (!file || !/\.mp3$/i.test(String(file.name ?? "")) || !(file.size > 10)) return { title: "", author: "" };
    const first = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    let n = 0;
    if (first[0] === 0x49 && first[1] === 0x44 && first[2] === 0x33) n = Math.min(10 + synchsafe(first, 6), 2 * 1024 * 1024);
    const head = n ? new Uint8Array(await file.slice(0, n).arrayBuffer()) : first;
    const tail = file.size >= 128 ? new Uint8Array(await file.slice(file.size - 128).arrayBuffer()) : undefined;
    return readId3(head, tail);
  } catch { return { title: "", author: "" }; }
}
