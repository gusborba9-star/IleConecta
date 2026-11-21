// Central de pendências minimizada em faixa no topo: nada é escondido nem apagado, só ocupa menos tela (o número continua à vista).

/** Prioridade mostrada: casa que nunca comprou pacote não vive uma urgência, então a assistente sem respostas aparece como normal. */
export function shownPriority(item, { hasCredits = false } = {}) {
  if (item?.kind === "assistente_sem_respostas" && !hasCredits) return "normal";
  return item?.priority === "alta" ? "alta" : "normal";
}

/** Pendência crítica: vencida, chamado do suporte, ajuste de moderação ou de prioridade alta. Fica à mostra mesmo com a central minimizada, até a casa resolver. */
export function isCritical(item, opts = {}) {
  if (!item) return false;
  return item.overdue === true || item.kind === "suporte" || item.kind === "moderacao" || shownPriority(item, opts) === "alta";
}

/** Quantas pendências a faixa mostra: as da central ou, se houver mais faturas a pagar do que itens, o número de faturas. */
export function bubbleCount(view) {
  const total = Number.isFinite(view?.total) ? view.total : 0;
  const pay = Number.isFinite(view?.toPay?.count) ? view.toPay.count : 0;
  return Math.max(0, total, pay);
}

/** Texto do número: inteiro até 99 e "99+" depois (a faixa tem espaço; só o número cresce). */
export const badgeText = (n) => { const v = Math.max(0, Math.trunc(Number(n) || 0)); return v > 99 ? "99+" : String(v); };

/** Frase para leitores de tela. */
export const bubbleLabel = (n, overdue = 0) => `${n} ${n === 1 ? "pendente" : "pendentes"}${overdue > 0 ? `, ${overdue} ${overdue === 1 ? "vencida" : "vencidas"}` : ""}`;

const STORE = (userId) => `ic:pend-faixa:${userId}`;

/** Lê o estado guardado neste aparelho: { minimized }. */
export function readBubble(userId, storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(STORE(userId)) ?? "null");
    return { minimized: raw?.minimized === true };
  } catch {
    return { minimized: false };
  }
}

export function writeBubble(userId, state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORE(userId), JSON.stringify({ minimized: state.minimized === true }));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
