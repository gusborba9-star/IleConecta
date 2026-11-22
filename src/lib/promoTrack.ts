import { trackPromotions } from "@/lib/promotions";
import { readSeen, addSeen } from "@/lib/seenCore";
import { openPromoToken } from "@/lib/promoAttribution";

// Fila de registros: cada promoção é enviada uma vez por visita (view e open), em lotes, para não pesar na tela.
const sent = { view: new Set<string>(), open: new Set<string>() };
const queue = { view: new Set<string>(), open: new Set<string>() };
let timer: number | undefined;

// Aparelhos: o servidor não guarda histórico por pessoa; quem sabe se é a 1ª vez daquele anúncio neste aparelho é o próprio aparelho.
const SEEN = "ic.promo.seen";
const loadSeen = (): Record<string, number> => { try { return readSeen(localStorage.getItem(SEEN) ?? "{}"); } catch { return {}; } };
const saveSeen = (m: Record<string, number>) => { try { localStorage.setItem(SEEN, JSON.stringify(m)); } catch { /* sem armazenamento: tudo conta como novo */ } };

function flush() {
  timer = undefined;
  for (const kind of ["view", "open"] as const) {
    const ids = [...queue[kind]];
    queue[kind].clear();
    if (!ids.length) continue;
    if (kind === "view") {
      const seen = loadSeen();
      const fresh = ids.filter((i) => !(i in seen));
      saveSeen(addSeen(seen, fresh));
      void trackPromotions(ids, kind, fresh);
    } else void trackPromotions(ids, kind);
  }
}

export function markPromo(id: string | undefined, kind: "view" | "open") {
  if (!id || sent[kind].has(id)) return;
  sent[kind].add(id);
  queue[kind].add(id);
  if (kind === "open") void openPromoToken(id);
  if (timer === undefined) timer = window.setTimeout(flush, kind === "open" ? 200 : 2000);
}
