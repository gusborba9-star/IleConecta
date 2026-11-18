import test from "node:test";
import assert from "node:assert/strict";
import { canPostMoments, canPostVideo, remainingToday, validateMomentFile, momentPath, safeFilePath, itemSeconds, normalizeFeed, isGroupSeen, startIndex, sortGroups, nextPosition, prevPosition, jumpGroup, parseSeen, serializeSeen, timeAgoPt, expiresInPt, MAX_MOMENT_BYTES, IMAGE_SECONDS } from "../src/lib/momentsCore.js";
import { DEFAULT_PLAN_MATRIX } from "../src/lib/planMatrixCore.js";

const U = (n) => `a0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const caps = (p) => DEFAULT_PLAN_MATRIX.caps[p];
const item = (n, o = {}) => ({ id: U(100 + n), kind: "image", url: "u" + n, poster: null, caption: null, createdAt: new Date(Date.UTC(2026, 10, 17, 12, n)).toISOString(), expiresAt: "", duration: null, link: null, ...o });
const grp = (n, items, o = {}) => ({ ownerId: U(n), houseId: U(50 + n), name: "Casa " + n, slug: "c" + n, followed: false, items, ...o });

test("quem pode publicar e quem pode publicar vídeo (decisão do proprietário)", () => {
  assert.deepEqual(["gratis", "base", "intermediario", "maximo"].map((p) => canPostMoments(caps(p))), [false, true, true, true]);
  assert.deepEqual(["gratis", "base", "intermediario", "maximo"].map((p) => canPostVideo(caps(p))), [false, false, false, true]);
  assert.equal(canPostMoments(null), false); assert.equal(canPostVideo(undefined), false);
});
test("limites diários iniciais 0/3/5/10 e o que ainda cabe hoje", () => {
  assert.deepEqual(["gratis", "base", "intermediario", "maximo"].map((p) => caps(p).moments_per_day), [0, 3, 5, 10]);
  assert.equal(remainingToday(caps("base"), 1), 2); assert.equal(remainingToday(caps("base"), 9), 0); assert.equal(remainingToday(caps("gratis"), 0), 0); assert.equal(remainingToday(null, 0), 0);
});
test("arquivo: tipos, tamanho e vídeo só no Premium", () => {
  assert.equal(validateMomentFile({ type: "image/jpeg", size: 1000 }, caps("base")), null);
  assert.match(validateMomentFile({ type: "video/mp4", size: 1000 }, caps("base")), /Premium/);
  assert.equal(validateMomentFile({ type: "video/mp4", size: 1000 }, caps("maximo")), null);
  assert.equal(validateMomentFile({ type: "video/quicktime", size: 1000 }, caps("maximo")), null);
  assert.match(validateMomentFile({ type: "application/pdf", size: 10 }, caps("maximo")), /foto/);
  assert.match(validateMomentFile({ type: "image/gif", size: 10 }, caps("base")), /JPG, PNG ou WebP/);
  assert.match(validateMomentFile({ type: "image/png", size: MAX_MOMENT_BYTES + 1 }, caps("base")), /25 MB/);
  assert.match(validateMomentFile({ type: "image/png", size: 0 }, caps("base")), /vazio/);
  assert.match(validateMomentFile(null, caps("base")), /Escolha/);
});
test("caminho do arquivo: pasta do dono, nome seguro, sem escapar", () => {
  assert.equal(momentPath(U(1), "abc123xy", "webp"), `${U(1)}/abc123xy.webp`);
  for (const bad of [["x", "abc123", "jpg"], [U(1), "../etc", "jpg"], [U(1), "abc123", "exe"], [U(1), "a b c d", "jpg"], [U(1), "abc123", "JPG"]]) assert.equal(momentPath(...bad), null, bad.join());
  assert.equal(safeFilePath(`${U(1)}/a.jpg`), `${U(1)}/a.jpg`);
  for (const bad of ["https://x.com/a.jpg", `${U(1)}/../a.jpg`, `${U(1)}/a/b.jpg`, "", null, 5, `${U(1)}/${"a".repeat(130)}`]) assert.equal(safeFilePath(bad), null);
});
test("tempo na tela: foto 6 s, vídeo pela duração (máx. 30 s)", () => {
  assert.equal(itemSeconds({ kind: "image" }), IMAGE_SECONDS);
  assert.equal(itemSeconds({ kind: "video", duration: 12 }), 12); assert.equal(itemSeconds({ kind: "video", duration: 99 }), 30);
  assert.equal(itemSeconds({ kind: "video" }), 30); assert.equal(itemSeconds({ kind: "video", duration: -3 }), 30); assert.equal(itemSeconds({ kind: "video", duration: NaN }), 30);
});
test("normalizeFeed: aceita o formato do banco, descarta lixo e não confia em endereço de fora", () => {
  const url = (p) => "https://cdn/" + p;
  const raw = [
    { owner_id: U(1), house_id: U(51), name: "Casa A", slug: "casa-a", avatar: "https://a/x.jpg", followed: true, items: [
      { id: U(101), kind: "image", path: `${U(1)}/a.jpg`, caption: "Oi", created_at: "2026-11-17T12:00:00Z", expires_at: "2026-11-18T12:00:00Z" },
      { id: U(102), kind: "video", path: `${U(1)}/v.mp4`, poster: `${U(1)}/p.jpg`, duration: 20, link_kind: "event", link_id: U(9), link_title: "Ritual" },
      { id: U(103), kind: "image", path: "https://evil/x.jpg" }, { id: "nao-uuid", path: `${U(1)}/b.jpg` }, null, "lixo" ] },
    { owner_id: "x", items: [] }, { owner_id: U(2), items: [] }, { owner_id: U(3), items: [{ id: U(104), path: "https://evil/y.jpg" }] }, 7, null,
  ];
  const g = normalizeFeed(raw, url);
  assert.equal(g.length, 1); assert.equal(g[0].items.length, 2); assert.equal(g[0].followed, true);
  assert.equal(g[0].items[0].url, `https://cdn/${U(1)}/a.jpg`); assert.equal(g[0].items[0].caption, "Oi");
  assert.equal(g[0].items[1].poster, `https://cdn/${U(1)}/p.jpg`); assert.deepEqual(g[0].items[1].link, { kind: "event", id: U(9), title: "Ritual" });
  assert.deepEqual(normalizeFeed(null), []); assert.deepEqual(normalizeFeed({}), []);
  const odd = normalizeFeed([{ owner_id: U(1), avatar: "javascript:alert(1)", items: [{ id: U(101), path: `${U(1)}/a.jpg`, link_kind: "evil", link_id: U(9) }] }], url);
  assert.equal(odd[0].avatar, undefined); assert.equal(odd[0].items[0].link, null);
});
test("ordem do carrossel: seguidas, depois destaques, depois as outras; não vistas e recentes primeiro", () => {
  const A = grp(1, [item(1)], { followed: true }), B = grp(2, [item(5)], { followed: true }), C = grp(3, [item(9)]), D = grp(4, [item(2)]), E = grp(5, [item(7)]);
  const seen = new Set([B.items[0].id]);
  const order = sortGroups([E, D, C, B, A], { highlightOwners: [U(4)], seen }).map((g) => g.ownerId);
  assert.deepEqual(order, [U(1), U(2), U(4), U(3), U(5)].map(String));
  assert.deepEqual(sortGroups([C, D, E]).map((g) => g.ownerId), [U(3), U(5), U(4)]);
  const input = [D, C]; sortGroups(input); assert.deepEqual(input, [D, C], "não altera a lista original");
});
test("visto: grupo todo visto, começo no primeiro não visto", () => {
  const g = grp(1, [item(1), item(2), item(3)]);
  assert.equal(isGroupSeen(g, new Set()), false); assert.equal(startIndex(g, new Set()), 0);
  assert.equal(startIndex(g, new Set([g.items[0].id])), 1);
  const all = new Set(g.items.map((i) => i.id)); assert.equal(isGroupSeen(g, all), true); assert.equal(startIndex(g, all), 0);
});
test("navegação: avança entre itens e casas, volta, pula de casa e para nas pontas", () => {
  const gs = [grp(1, [item(1), item(2)]), grp(2, [item(3)])];
  assert.deepEqual(nextPosition(gs, 0, 0), { gi: 0, ii: 1 }); assert.deepEqual(nextPosition(gs, 0, 1), { gi: 1, ii: 0 }); assert.equal(nextPosition(gs, 1, 0), null); assert.equal(nextPosition(gs, 5, 0), null);
  assert.deepEqual(prevPosition(gs, 1, 0), { gi: 0, ii: 1 }); assert.deepEqual(prevPosition(gs, 0, 1), { gi: 0, ii: 0 }); assert.deepEqual(prevPosition(gs, 0, 0), { gi: 0, ii: 0 });
  assert.deepEqual(jumpGroup(gs, 0, 1), { gi: 1, ii: 0 }); assert.equal(jumpGroup(gs, 1, 1), null); assert.equal(jumpGroup(gs, 0, -1), null);
});
test("vistos no aparelho: lixo vira vazio, lista não cresce além do necessário", () => {
  assert.equal(parseSeen("isso não é json").size, 0); assert.equal(parseSeen(null).size, 0); assert.equal(parseSeen('{"a":1}').size, 0); assert.equal(parseSeen(JSON.stringify([U(1), "x", 5, U(2)])).size, 2);
  const s = new Set([U(1), U(2), U(3)]);
  assert.deepEqual(JSON.parse(serializeSeen(s, [U(2), U(3), U(9)])), [U(2), U(3)]);
  const big = new Set(Array.from({ length: 900 }, (_, i) => U(1000 + i)));
  assert.equal(JSON.parse(serializeSeen(big, [...big])).length, 400);
});
test("textos de tempo", () => {
  const now = Date.parse("2026-11-17T15:00:00Z");
  assert.equal(timeAgoPt("2026-11-17T15:00:00Z", now), "agora"); assert.equal(timeAgoPt("2026-11-17T14:55:00Z", now), "há 5 min"); assert.equal(timeAgoPt("2026-11-17T12:00:00Z", now), "há 3 h"); assert.equal(timeAgoPt("lixo", now), "");
  assert.equal(expiresInPt("2026-11-17T15:20:00Z", now), "20 min"); assert.equal(expiresInPt("2026-11-18T11:00:00Z", now), "20 h"); assert.equal(expiresInPt("x", now), "");
});

test("momentPath aceita o nome aleatório que a tela gera (12 caracteres) e recusa nomes longos demais", async () => {
  const { momentPath } = await import("../src/lib/momentsCore.js");
  const u = "00000000-0000-0000-0000-000000000001";
  assert.equal(momentPath(u, "a1b2c3d4e5f6", "webp"), `${u}/a1b2c3d4e5f6.webp`);
  assert.equal(momentPath(u, "a1b2c3d4e5f6g", "webp"), null);
});

test("normalizeFeed: curtida minha e contagens (só vêm para a casa; nulo para os outros; lixo vira nulo)", async () => {
  const { normalizeFeed } = await import("../src/lib/momentsCore.js");
  const u = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const mk = (extra) => [{ owner_id: u(1), house_id: u(2), name: "C", slug: "c", items: [{ id: u(3), kind: "image", path: `${u(1)}/a1b2c3d4e5f6.webp`, created_at: "x", expires_at: "y", ...extra }] }];
  const a = normalizeFeed(mk({ liked: true, views: 7, likes: 2, comments: 1 }))[0].items[0];
  assert.deepEqual([a.liked, a.views, a.likes, a.comments], [true, 7, 2, 1]);
  const b = normalizeFeed(mk({ views: null, likes: null, comments: null }))[0].items[0];
  assert.deepEqual([b.liked, b.views, b.likes, b.comments], [false, null, null, null]);
  const c = normalizeFeed(mk({ liked: "sim", views: -3, likes: "abc", comments: 2.9 }))[0].items[0];
  assert.deepEqual([c.liked, c.views, c.likes, c.comments], [false, null, null, 2]);
});

test("normalizeStats: aceita o formato do banco, descarta lixo e limita o texto", async () => {
  const { normalizeStats } = await import("../src/lib/momentsCore.js");
  const u = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const s = normalizeStats({ views: 3, likes: 1, comments_count: 2,
    likers: [{ user_id: u(1), name: "Ana", avatar: "https://x.test/a.png", at: "t" }, { user_id: "nao-uuid", name: "X" }],
    comments: [{ id: u(9), user_id: u(2), name: "", body: "y".repeat(500), at: "t", avatar: "http://inseguro" }, { id: "ruim", user_id: u(3), body: "z" }] });
  assert.equal(s.views, 3); assert.equal(s.commentsCount, 2);
  assert.equal(s.likers.length, 1); assert.equal(s.likers[0].name, "Ana");
  assert.equal(s.comments.length, 1); assert.equal(s.comments[0].body.length, 300); assert.equal(s.comments[0].name, "Alguém"); assert.equal(s.comments[0].avatar, undefined);
  assert.deepEqual(normalizeStats(null), { views: 0, likes: 0, commentsCount: 0, likers: [], comments: [] });
});
