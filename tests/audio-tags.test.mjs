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

test("ID3v2.4 em UTF-8: título e artista", () => {
  assert.deepEqual(readId3(tag([frame("TIT2", 3, u8("Brisa de Axé")), frame("TPE1", 3, u8("Sascha Ende"))])), { title: "Brisa de Axé", author: "Sascha Ende" });
});
test("ID3v2.3 em UTF-16 com BOM e em Latin-1", () => {
  assert.deepEqual(readId3(tag([frame("TIT2", 1, u16("Canção"), false), frame("TPE1", 0, latin("Ana"), false)], 3)), { title: "Canção", author: "Ana" });
});
test("ignora outros quadros (imagem grande) e continua lendo", () => {
  const apic = frame("APIC", 0, new Array(500).fill(7));
  assert.equal(readId3(tag([apic, frame("TIT2", 3, u8("Depois da capa"))])).title, "Depois da capa");
});
test("ID3v1 no fim do arquivo quando não há v2", () => {
  const t = new Uint8Array(128); t.set([0x54, 0x41, 0x47]); t.set(latin("Velha Guarda"), 3); t.set(latin("Beto"), 33);
  assert.deepEqual(readId3(new Uint8Array([1, 2, 3]), t), { title: "Velha Guarda", author: "Beto" });
});
test("lixo, arquivo vazio, quadro maior que a etiqueta e texto hostil não quebram nem passam de 80 caracteres", () => {
  assert.deepEqual(readId3(new Uint8Array([])), { title: "", author: "" });
  assert.deepEqual(readId3(new Uint8Array(20).fill(255)), { title: "", author: "" });
  const bad = tag([frame("TIT2", 3, u8("x"))]); bad[13] = 0x7f; // tamanho do quadro absurdo
  assert.deepEqual(readId3(bad), { title: "", author: "" });
  const long = readId3(tag([frame("TIT2", 3, u8("a".repeat(500)))]));
  assert.equal(long.title.length, 80);
  const hostile = readId3(tag([frame("TIT2", 3, u8("<img src=x onerror=1>\u0000\u0007\n"))]));
  assert.ok(!/[\u0000-\u001f]/.test(hostile.title)); assert.equal(hostile.title, "<img src=x onerror=1>");
});
test("licença incompleta: lista o que falta", () => {
  assert.deepEqual(licenseGap({ license_kind: "cc_by", license_url: "https://x", source_url: "https://y", license_date: "2026-11-18" }), []);
  assert.deepEqual(licenseGap({ license_kind: null, license_url: null, source_url: "https://y", license_date: null }), ["tipo de licença", "link da licença", "data da conferência"]);
  assert.equal(licenseGap(null).length, 4);
});
