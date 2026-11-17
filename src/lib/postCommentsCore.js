// Comentários do feed sob demanda (migration 0150): o feed traz só a CONTAGEM de cada publicação e os comentários são lidos ao abrir.
// Regras puras: o que mostrar como contagem, como juntar o feed novo com o que já foi aberto e como somar um comentário novo.

/** Comentários que a pessoa enxerga: oculto só aparece para a casa dona e para quem escreveu. */
export function visibleComments(post, { mine, userId }) {
  return (post.comments ?? []).filter((c) => !c.hidden || mine || c.userId === userId);
}

/** Número mostrado no botão: aberto = o que está na tela; fechado = a contagem do servidor (undefined = ainda não se sabe); demonstração = a lista. */
export function shownCommentCount(post, who) {
  if (post.commentsLoaded === false) return post.commentCount;
  return visibleComments(post, who).length;
}

/** Junta o feed recém-lido com o que já estava na tela: comentários já abertos continuam visíveis; se a contagem do servidor mudou, pedem nova leitura. */
export function mergeFeedComments(prev, fresh) {
  const before = new Map((prev ?? []).map((p) => [p.id, p]));
  return fresh.map((p) => {
    const old = before.get(p.id);
    if (!old || old.commentsLoaded !== true) return p;
    const changed = typeof p.commentCount === "number" && p.commentCount !== old.comments.length;
    return { ...p, comments: old.comments, commentsLoaded: !changed, commentCount: p.commentCount ?? old.comments.length };
  });
}

/** Soma um comentário recém-enviado: entra na lista se ela já foi aberta e sempre sobe a contagem. */
export function withNewComment(post, comment) {
  const count = (post.commentCount ?? (post.comments ?? []).length) + 1;
  return { ...post, comments: [...(post.comments ?? []), comment], commentCount: count };
}

/** Marca como lidos os comentários que vieram do servidor. */
export function withLoadedComments(post, comments) {
  return { ...post, comments, commentsLoaded: true, commentCount: comments.length };
}
