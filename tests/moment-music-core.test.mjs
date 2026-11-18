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
  assert.deepEqual(ok[0].items[0].music, { id: U(9), title: "Brisa", author: "Ana", url: "https://x.test/abcd1234efgh.mp3" });
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
