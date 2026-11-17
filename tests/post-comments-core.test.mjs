import test from "node:test";
import assert from "node:assert/strict";
import { visibleComments, shownCommentCount, mergeFeedComments, withNewComment, withLoadedComments } from "../src/lib/postCommentsCore.js";

const c = (id, userId, hidden = false) => ({ id, userId, text: `t${id}`, createdAt: "2026-11-17T10:00:00Z", ...(hidden ? { hidden: true } : {}) });
const remote = (id, n) => ({ id, comments: [], commentsLoaded: false, ...(n === undefined ? {} : { commentCount: n }) });
const who = { mine: false, userId: "u1" };

test("contagem: post real fechado mostra a contagem do servidor; sem contagem, nada (o botão diz só 'Comentários')", () => {
  assert.equal(shownCommentCount(remote("a", 7), who), 7);
  assert.equal(shownCommentCount(remote("a", 0), who), 0);
  assert.equal(shownCommentCount(remote("a"), who), undefined);
});

test("contagem: aberto = o que está na tela (oculto só para a dona e para quem escreveu)", () => {
  const p = { id: "a", commentsLoaded: true, comments: [c(1, "x"), c(2, "y", true), c(3, "u1", true)] };
  assert.equal(shownCommentCount(p, who), 2);
  assert.equal(shownCommentCount(p, { mine: true, userId: "dona" }), 3);
  assert.equal(shownCommentCount(p, { mine: false, userId: null }), 1);
});

test("contagem: demonstração (sem commentsLoaded) usa a lista", () => {
  assert.equal(shownCommentCount({ id: "d", comments: [c(1, "x"), c(2, "y")] }, who), 2);
  assert.equal(shownCommentCount({ id: "d", comments: [] }, who), 0);
});

test("visibleComments não depende da ordem e aceita lista ausente", () => {
  assert.deepEqual(visibleComments({ id: "z" }, who), []);
});

test("feed novo mantém os comentários já abertos quando a contagem não mudou", () => {
  const prev = [withLoadedComments(remote("a", 2), [c(1, "x"), c(2, "y")]), remote("b", 4)];
  const out = mergeFeedComments(prev, [remote("a", 2), remote("b", 4), remote("c", 1)]);
  assert.equal(out[0].commentsLoaded, true);
  assert.equal(out[0].comments.length, 2);
  assert.equal(out[1].commentsLoaded, false);
  assert.equal(out[2].commentsLoaded, false);
});

test("feed novo com mais comentários marca para ler de novo, sem apagar o que está na tela", () => {
  const prev = [withLoadedComments(remote("a", 2), [c(1, "x"), c(2, "y")])];
  const out = mergeFeedComments(prev, [remote("a", 3)]);
  assert.equal(out[0].commentsLoaded, false);
  assert.equal(out[0].comments.length, 2);
  assert.equal(out[0].commentCount, 3);
});

test("feed novo com menos comentários (um foi apagado) também pede nova leitura", () => {
  const prev = [withLoadedComments(remote("a", 3), [c(1, "x"), c(2, "y"), c(3, "z")])];
  assert.equal(mergeFeedComments(prev, [remote("a", 2)])[0].commentsLoaded, false);
});

test("feed novo sem contagem (servidor falhou) não derruba a lista aberta", () => {
  const prev = [withLoadedComments(remote("a", 2), [c(1, "x"), c(2, "y")])];
  const out = mergeFeedComments(prev, [remote("a")]);
  assert.equal(out[0].commentsLoaded, true);
  assert.equal(out[0].comments.length, 2);
  assert.equal(out[0].commentCount, 2);
});

test("post que sumiu do feed não aparece; post novo entra fechado", () => {
  const out = mergeFeedComments([withLoadedComments(remote("a", 1), [c(1, "x")])], [remote("n", 0)]);
  assert.deepEqual(out.map((p) => p.id), ["n"]);
  assert.equal(out[0].commentsLoaded, false);
});

test("comentário novo soma na lista e na contagem; fechado também sobe a contagem", () => {
  const open = withNewComment(withLoadedComments(remote("a", 2), [c(1, "x"), c(2, "y")]), c(3, "u1"));
  assert.equal(open.comments.length, 3);
  assert.equal(open.commentCount, 3);
  const closed = withNewComment(remote("b", 5), c(9, "u1"));
  assert.equal(closed.commentCount, 6);
});

test("não muda o objeto original (estado imutável)", () => {
  const p = withLoadedComments(remote("a", 1), [c(1, "x")]);
  const snapshot = JSON.stringify(p);
  withNewComment(p, c(2, "y")); mergeFeedComments([p], [remote("a", 5)]);
  assert.equal(JSON.stringify(p), snapshot);
});
