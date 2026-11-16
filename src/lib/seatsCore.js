// Vaga extra de equipe: lê o estado devolvido pelo banco (my_seat_status) e monta os textos. Só exibição: o banco decide e cobra.
const int = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const iso = (v) => (typeof v === "string" && /^20[0-9]{2}-[01][0-9]-[0-3][0-9]/.test(v) ? v.slice(0, 10) : null);

export function readSeatStatus(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const q = o.quote && typeof o.quote === "object" ? o.quote : null;
  const amount = q ? int(q.amount_cents) : 0;
  return {
    hasHouse: o.has_house === true,
    subscribed: o.subscribed === true,
    included: int(o.included),
    extra: int(o.extra),
    inUse: int(o.in_use),
    quote: q && amount > 0 ? { amountCents: amount, monthlyCents: int(q.monthly_cents), daysLeft: int(q.days_left), daysTotal: int(q.days_total), cycleEnd: iso(q.cycle_end) } : null,
    blocked: typeof o.blocked === "string" && o.blocked ? o.blocked.slice(0, 300) : null,
    releaseTo: o.release_to === null || o.release_to === undefined ? null : int(o.release_to),
    releaseOn: iso(o.release_on),
  };
}

export const dateBR = (isoDate) => (isoDate ? isoDate.split("-").reverse().join("/") : "");

/** Quantas vagas a casa pode manter ao reduzir: de 0 até (extras − 1), nunca abaixo do que a equipe em uso exige. */
export function keepOptions(st) {
  const minKeep = Math.max(0, st.inUse - st.included);
  const out = [];
  for (let k = minKeep; k < st.extra; k++) out.push(k);
  return out;
}

/** Pode contratar agora? Só com assinatura, cotação válida e sem motivo de bloqueio. */
export const canBuySeat = (st) => st.subscribed && st.quote !== null && st.blocked === null;
