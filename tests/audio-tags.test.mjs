import test from "node:test";
import assert from "node:assert/strict";
import { readId3 } from "../src/lib/audioTags.js";
import { licenseGap } from "../src/lib/momentsCore.js";

const ss = (n) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const frame = (id, enc, bytes, v4 = true) => { const body = [enc, ...bytes]; const sz = v4 ? ss(body.length) : [0, 0, (body.length >> 8) & 255, body.length & 255]; return [...[...id].map((c) => c.charCodeAt(0)), ...sz, 0, 0, ...body]; };
const tag = (frames, ver = 4, flags = 0) => { const body = frames.flat(); return new Uint8Array([0x49, 0x44, 0x33, ver, 0, flags, ...ss(body.length), ...body]); };
const latin = (s) => [...s].map((c) => c.charCodeAt(0));
const u16 = (s) => [0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])];
const u8 = (s) => [...new TextEncoder().encode(s)];
const E = { title: "", author: "", source: "", licenseUrl: "", licenseKind: "", licenseNote: "", warning: "" };

test("ID3v2.4 em UTF-8: título e artista", () => {
  assert.deepEqual(readId3(tag([frame("TIT2", 3, u8("Brisa de Axé")), frame("TPE1", 3, u8("Sascha Ende"))])), { ...E, title: "Brisa de Axé", author: "Sascha Ende" });
});
test("ID3v2.3 em UTF-16 com BOM e em Latin-1", () => {
  assert.deepEqual(readId3(tag([frame("TIT2", 1, u16("Canção"), false), frame("TPE1", 0, latin("Ana"), false)], 3)), { ...E, title: "Canção", author: "Ana" });
});
test("ignora outros quadros (imagem grande) e continua lendo", () => {
  const apic = frame("APIC", 0, new Array(500).fill(7));
  assert.equal(readId3(tag([apic, frame("TIT2", 3, u8("Depois da capa"))])).title, "Depois da capa");
});
test("ID3v1 no fim do arquivo quando não há v2", () => {
  const t = new Uint8Array(128); t.set([0x54, 0x41, 0x47]); t.set(latin("Velha Guarda"), 3); t.set(latin("Beto"), 33);
  assert.deepEqual(readId3(new Uint8Array([1, 2, 3]), t), { ...E, title: "Velha Guarda", author: "Beto" });
});
test("lixo, arquivo vazio, quadro maior que a etiqueta e texto hostil não quebram nem passam de 80 caracteres", () => {
  assert.deepEqual(readId3(new Uint8Array([])), E);
  assert.deepEqual(readId3(new Uint8Array(20).fill(255)), E);
  const bad = tag([frame("TIT2", 3, u8("x"))]); bad[13] = 0x7f; // tamanho do quadro absurdo
  assert.deepEqual(readId3(bad), E);
  const long = readId3(tag([frame("TIT2", 3, u8("a".repeat(500)))]));
  assert.equal(long.title.length, 80);
  const hostile = readId3(tag([frame("TIT2", 3, u8("<img src=x onerror=1>\u0000\u0007\n"))]));
  assert.ok(!/[\u0000-\u001f]/.test(hostile.title)); assert.equal(hostile.title, "<img src=x onerror=1>");
});
const xx = (id, enc, desc, val, descEnc = enc) => frame(id, enc, [...desc, 0, ...(descEnc === 1 ? [0] : []), ...val]);
test("ENDE: link da fonte (WXXX), licença CC BY 4.0 em TCOP e em TXXX", () => {
  const t = readId3(tag([frame("TIT2", 3, u8("Brisa")), frame("TCOP", 3, u8("CC BY 4.0")), xx("WXXX", 0, latin(""), latin("https://ende.app/pt/music/brisa/")),
    xx("TXXX", 3, u8("License"), u8("https://creativecommons.org/licenses/by/4.0/"))]));
  assert.equal(t.source, "https://ende.app/pt/music/brisa/"); assert.equal(t.licenseKind, "cc_by");
  assert.equal(t.licenseUrl, "https://creativecommons.org/licenses/by/4.0/"); assert.equal(t.warning, "");
});
test("Suno: comentário 'made with suno' vira licença Outra com a data em Brasília", () => {
  const c = frame("COMM", 3, [...latin("eng"), 0, ...u8("made with suno; created=2026-11-20T00:28:22Z; id=abc")]);
  const t = readId3(tag([frame("TIT2", 3, u8("Chamado")), c]));
  assert.equal(t.licenseKind, "outra"); assert.equal(t.licenseNote, "Criada na Suno em 19/11/2026");
});
test("CC0 é reconhecido; BY 3.0 não vira sugestão", () => {
  assert.equal(readId3(tag([frame("TCOP", 3, u8("CC0 1.0 Universal"))])).licenseKind, "cc0");
  assert.equal(readId3(tag([frame("TCOP", 3, u8("CC BY 3.0"))])).licenseKind, "");
});
test("licença não comercial, sem derivados ou igual vira aviso e nunca sugestão", () => {
  for (const x of ["CC BY-NC 3.0", "CC BY-NC-SA 4.0", "Creative Commons BY-ND", "non-commercial use only", "CC BY-SA 4.0"]) {
    const t = readId3(tag([frame("TCOP", 3, u8(x))]));
    assert.ok(t.warning, x); assert.equal(t.licenseKind, "", x);
  }
});
test("links que não são https, com script ou grandes demais são ignorados; WXXX em UTF-16 funciona", () => {
  assert.equal(readId3(tag([xx("WXXX", 0, latin(""), latin("http://x.com/a"))])).source, "");
  assert.equal(readId3(tag([xx("WXXX", 0, latin(""), latin("javascript:alert(1)"))])).source, "");
  assert.equal(readId3(tag([xx("WXXX", 0, latin(""), latin("https://x.com/" + "a".repeat(400)))])).source, "");
  const u = readId3(tag([xx("WXXX", 1, u16("fonte"), latin("https://ok.com/a"), 1)]));
  assert.equal(u.source, "https://ok.com/a");
});
test("quadro de comentário quebrado (BOM inválido) não derruba a leitura", () => {
  const bad = frame("COMM", 1, [...latin("eng"), 0xff, 0xff, 0, 0, 0xd8, 0x00]);
  assert.equal(readId3(tag([bad, frame("TIT2", 3, u8("Segue"))])).title, "Segue");
});
test("licença incompleta: lista o que falta", () => {
  assert.deepEqual(licenseGap({ license_kind: "cc_by", license_url: "https://x", source_url: "https://y", license_date: "2026-11-18" }), []);
  assert.deepEqual(licenseGap({ license_kind: null, license_url: null, source_url: "https://y", license_date: null }), ["tipo de licença", "link da licença", "data da conferência"]);
  assert.equal(licenseGap(null).length, 4);
  // criada pelo dono (Suno): não pede link; pede a observação
  assert.deepEqual(licenseGap({ license_kind: "outra", license_note: "Criada na Suno (Pro)", license_url: null, source_url: null, license_date: "2026-11-19" }), []);
  assert.deepEqual(licenseGap({ license_kind: "outra", license_note: " ", license_date: "2026-11-19" }), ["observação da licença"]);
  assert.deepEqual(licenseGap({ license_kind: "cc_by", license_note: "x", license_url: null, source_url: "https://y", license_date: "2026-11-19" }), ["link da licença"]);
});
