// Central de pendências minimizada em balão flutuante: nada é escondido nem apagado, só ocupa menos tela (o número continua à vista).

/** Prioridade mostrada: casa que nunca comprou pacote não vive uma urgência, então a assistente sem respostas aparece como normal. */
export function shownPriority(item, { hasCredits = false } = {}) {
  if (item?.kind === "assistente_sem_respostas" && !hasCredits) return "normal";
  return item?.priority === "alta" ? "alta" : "normal";
}

/** Quantas pendências o balão mostra: as da central ou, se houver mais faturas a pagar do que itens, o número de faturas. */
export function bubbleCount(view) {
  const total = Number.isFinite(view?.total) ? view.total : 0;
  const pay = Number.isFinite(view?.toPay?.count) ? view.toPay.count : 0;
  return Math.max(0, total, pay);
}

/** Texto do número no balão: 1, 2, 5, 8… e "9+" a partir de 10 (o balão nunca cresce). */
export const badgeText = (n) => (n > 9 ? "9+" : String(Math.max(0, Math.trunc(Number(n) || 0))));

/** Frase para leitores de tela. */
export const bubbleLabel = (n, overdue = 0) => `Abrir a central de pendências: ${n} ${n === 1 ? "pendente" : "pendentes"}${overdue > 0 ? `, ${overdue} ${overdue === 1 ? "vencida" : "vencidas"}` : ""}`;

const STORE = (userId) => `ic:pend-bubble:${userId}`;

/** Lê o estado guardado neste aparelho: { minimized, overdue (quantas vencidas havia ao minimizar) }. */
export function readBubble(userId, storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(STORE(userId)) ?? "null");
    return { minimized: raw?.minimized === true, overdue: Number.isFinite(raw?.overdue) ? Math.max(0, Math.trunc(raw.overdue)) : 0 };
  } catch {
    return { minimized: false, overdue: 0 };
  }
}

export function writeBubble(userId, state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORE(userId), JSON.stringify({ minimized: state.minimized === true, overdue: Math.max(0, Math.trunc(Number(state.overdue) || 0)) }));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** O balão abre sozinho quando surge pendência vencida nova (mais vencidas do que havia ao minimizar). */
export const shouldReopen = (state, overdueNow) => state.minimized === true && Number(overdueNow) > state.overdue;
