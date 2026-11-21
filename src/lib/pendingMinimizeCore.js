// Minimizar pendências informativas (sem esconder): o card vira uma linha compacta, com ponto de atenção, e volta aberto se a situação piorar.

/** Só estas pendências podem ser minimizadas. Tudo o que envolve cliente, dinheiro a pagar, moderação ou suporte nunca é. */
const MINIMIZABLE = new Set(["assistente_sem_respostas", "cartao_vencendo"]);

/**
 * Pode minimizar?
 * - Assistente sem respostas: casa que nunca comprou pacote pode sempre; quem já comprou só enquanto é aviso de "quase sem" (se acabou, fica aberto).
 * - Cartão salvo: só enquanto não venceu.
 */
export function canMinimize(item, { hasCredits = false } = {}) {
  if (!item || !MINIMIZABLE.has(item.kind) || item.overdue === true) return false;
  if (item.kind === "assistente_sem_respostas") return !hasCredits || item.priority !== "alta";
  return true;
}

/** Chave do estado: a mesma pendência com prioridade maior (ex.: de "quase sem" para "acabou") tem outra chave e reabre sozinha. */
export const minimizeKey = (item) => `${item?.kind}:${item?.refId}:${item?.priority}`;

/** Prioridade mostrada: casa que nunca comprou pacote não vive uma urgência, então a assistente sem respostas aparece como normal. */
export function shownPriority(item, { hasCredits = false } = {}) {
  if (item?.kind === "assistente_sem_respostas" && !hasCredits) return "normal";
  return item?.priority === "alta" ? "alta" : "normal";
}

const STORE = (userId) => `ic:pend-min:${userId}`;

export function readMinimized(userId, storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(STORE(userId)) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k) => typeof k === "string").slice(0, 50) : []);
  } catch {
    return new Set();
  }
}

/** Guarda só as chaves que ainda existem na central (o resto é limpo sozinho). */
export function writeMinimized(userId, keys, alive, storage = globalThis.localStorage) {
  try {
    const live = new Set(alive);
    storage?.setItem(STORE(userId), JSON.stringify([...keys].filter((k) => live.has(k)).slice(0, 50)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
