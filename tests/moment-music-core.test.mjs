import test from "node:test";
import assert from "node:assert/strict";
import { MUSIC_MAX_BYTES, musicExt, normalizeFeed, normalizeMusicCatalog, safeMusicPath, validateMusicFile } from "../src/lib/momentsCore.js";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const url = (p) => `https://x.test/${p}`;

test("nome de arquivo de música: só o padrão do bucket", () => {
  assert.equal(safeMusicPath("abcd1234efgh.mp3"), "abcd1234efgh.mp3");
  for (const bad of ["../a.mp3", "abc.mp3", "ABCDEFGH1234.mp3", "abcd1234.exe", "a/b/abcd1234.mp3", "abcd1234.mp3?x=1", "", null, 5, "abcd1234.mp3\n"]) assert.equal(safeMusicPath(bad), null, String(bad));
});
test("envio de música: formatos, tamanho e arquivo vazio", () => {
  assert.equal(validateMusicFile({ name: "a.mp3", type: "audio/mpeg", size: 3e6 }), null);
  assert.equal(validateMusicFile({ name: "a.m4a", type: "", size: 3e6 }), null); // navegador sem tipo: vale a extensão
  assert.match(validateMusicFile({ name: "a.wav", type: "audio/wav", size: 100 }), /MP3, M4A ou OGG/);
  assert.match(validateMusicFile({ name: "a.exe", type: "", size: 100 }), /MP3, M4A ou OGG/);
  assert.match(validateMusicFile({ name: "a.mp3", type: "audio/mpeg", size: MUSIC_MAX_BYTES + 1 }), /8 MB/);
  assert.match(validateMusicFile({ name: "a.mp3", type: "audio/mpeg", size: 0 }), /vazio/);
  assert.match(validateMusicFile(null), /MP3/);
  assert.equal(musicExt({ name: "Faixa.OGG", type: "" }), "ogg"); assert.equal(musicExt({ name: "x.zip", type: "" }), null);
});
test("feed: a música entra só em foto, só com arquivo válido e título/autor limpos", () => {
  const mk = (kind, music) => ({ owner_id: U(1), house_id: U(2), name: "C", slug: "c", items: [{ id: U(3), kind, path: `${U(1)}/a.${kind === "video" ? "mp4" : "jpg"}`, poster: `${U(1)}/p.jpg`, music }] });
  const ok = normalizeFeed([mk("image", { id: U(9), title: "Brisa", author: "Ana", path: "abcd1234efgh.mp3" })], url, url);
  assert.deepEqual(ok[0].items[0].music, { id: U(9), title: "Brisa", author: "Ana", url: "https://x.test/abcd1234efgh.mp3", style: null, occasions: [], vocal: false });
  assert.equal(normalizeFeed([mk("video", { id: U(9), title: "B", author: "A", path: "abcd1234efgh.mp3" })], url, url)[0].items[0].music, null);
  for (const m of [{ id: U(9), title: "B", path: "../x.mp3" }, { id: "nao-uuid", title: "B", path: "abcd1234efgh.mp3" }, null, "texto", { id: U(9), path: "abcd1234efgh.exe" }]) assert.equal(normalizeFeed([mk("image", m)], url, url)[0].items[0].music, null);
  assert.equal(normalizeFeed([mk("image", { id: U(9), title: "B", path: "abcd1234efgh.mp3" })], url)[0].items[0].music, null, "sem função de endereço de música, nunca inventa um");
  assert.equal(normalizeFeed([mk("image", { id: U(9), title: "B", path: "abcd1234efgh.mp3" })], url, () => null)[0].items[0].music, null);
  assert.equal(normalizeFeed([mk("image", { id: U(9), title: "t".repeat(500), author: "a".repeat(500), path: "abcd1234efgh.mp3" })], url, url)[0].items[0].music.title.length, 80);
});
test("catálogo para a casa: ignora lixo e limita a 300", () => {
  const row = (i) => ({ id: U(i), title: `T${i}`, author: "A", path: "abcd1234efgh.mp3" });
  assert.equal(normalizeMusicCatalog([row(1), { id: U(2), path: "../x.mp3" }, null, 7], url).length, 1);
  assert.deepEqual(normalizeMusicCatalog("nada", url), []);
  assert.equal(normalizeMusicCatalog(Array.from({ length: 400 }, (_, i) => row(i + 1)), url).length, 300);
});

// ---- 2D: estilo, ocasião, voz, filtros e créditos
import { MUSIC_OCCASIONS, MUSIC_STYLES, filterMusic, normalizeMusicCredits } from "../src/lib/momentsCore.js";
const id = (n) => `a0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const cat = normalizeMusicCatalog([
  { id: id(1), title: "Parabéns Alegre", author: "Ana", path: "aaaaaaaa1111.mp3", style: "pop", occasions: ["aniversario", "festa", "festa", "inventada"], vocal: true },
  { id: id(2), title: "Brisa Calma", author: "Beto", path: "bbbbbbbb2222.mp3", style: "ambiente", occasions: ["calma"], vocal: false },
  { id: id(3), title: "Sem rótulo", author: "Cris", path: "cccccccc3333.mp3", style: "<script>", occasions: "x", vocal: "sim" },
], (p) => `https://m/${p}`);
test("catálogo: estilo e ocasião desconhecidos somem, repetidos juntam, voz só se for verdadeiro", () => {
  assert.deepEqual(cat[0].occasions, ["aniversario", "festa"]);
  assert.equal(cat[0].style, "pop"); assert.equal(cat[0].vocal, true);
  assert.equal(cat[2].style, null); assert.deepEqual(cat[2].occasions, []); assert.equal(cat[2].vocal, false);
});
test("filtros: estilo, ocasião, voz e busca sem acento", () => {
  assert.equal(filterMusic(cat, { style: "pop" }).length, 1);
  assert.equal(filterMusic(cat, { occasion: "calma" })[0].title, "Brisa Calma");
  assert.equal(filterMusic(cat, { voice: "com" }).length, 1);
  assert.equal(filterMusic(cat, { voice: "sem" }).length, 2);
  assert.equal(filterMusic(cat, { q: "PARABENS" }).length, 1);
  assert.equal(filterMusic(cat, { q: "beto" }).length, 1);
  assert.equal(filterMusic(cat, { style: "pop", occasion: "calma" }).length, 0);
  assert.equal(filterMusic(null, {}).length, 0);
});
test("listas de estilos e ocasiões têm o formato aceito pelo banco", () => {
  for (const k of [...Object.keys(MUSIC_STYLES), ...Object.keys(MUSIC_OCCASIONS)]) assert.match(k, /^[a-z_]{2,20}$/);
});
test("créditos: só links https, licença com nome, textos cortados e lixo ignorado", () => {
  const c = normalizeMusicCredits([
    { title: "A", author: "B", source_url: "https://x.com/a", license_kind: "cc_by", license_url: "https://creativecommons.org/licenses/by/4.0/" },
    { title: "C", author: "D", source_url: "javascript:alert(1)", license_url: "http://x.com", license_kind: "nada", license_note: "Nota" },
    null, 7, "x",
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].license, "CC BY 4.0"); assert.equal(c[0].source, "https://x.com/a");
  assert.equal(c[1].source, null); assert.equal(c[1].licenseUrl, null); assert.equal(c[1].license, "Nota");
  assert.deepEqual(normalizeMusicCredits("x"), []);
});
test("créditos: faixa 'Outra' mostra a observação da licença (ex.: criada na Suno), não só 'Outra'", () => {
  const [a, b] = normalizeMusicCredits([
    { title: "S", author: "G", license_kind: "outra", license_note: "Criada por Gustavo na Suno (plano Pro), em 19/11/2026" },
    { title: "T", author: "G", license_kind: "outra" },
  ]);
  assert.equal(a.license, "Criada por Gustavo na Suno (plano Pro), em 19/11/2026"); assert.equal(b.license, "Outra");
});
