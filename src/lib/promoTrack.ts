import { trackPromotions } from "@/lib/promotions";

// Fila de registros: cada promoção é enviada uma vez por visita (view e open), em lotes, para não pesar na tela.
const sent = { view: new Set<string>(), open: new Set<string>() };
const queue = { view: new Set<string>(), open: new Set<string>() };
let timer: number | undefined;

function flush() {
  timer = undefined;
  for (const kind of ["view", "open"] as const) {
    const ids = [...queue[kind]];
    queue[kind].clear();
    if (ids.length) void trackPromotions(ids, kind);
  }
}

export function markPromo(id: string | undefined, kind: "view" | "open") {
  if (!id || sent[kind].has(id)) return;
  sent[kind].add(id);
  queue[kind].add(id);
  if (timer === undefined) timer = window.setTimeout(flush, kind === "open" ? 200 : 2000);
}
