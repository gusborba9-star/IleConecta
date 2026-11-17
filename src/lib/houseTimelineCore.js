// Linha do tempo da casa (administração): lê e valida o que vem do banco antes de mostrar. O banco já devolve só fatos da casa com a plataforma.
export const EVENT_LABELS = {
  casa_criada: "Casa criada",
  plano: "Mudança de plano",
  fatura_emitida: "Fatura emitida",
  fatura_paga: "Fatura paga",
  reembolso_plataforma: "Reembolso da plataforma",
  reembolso_cliente: "Reembolso de cliente",
  moderacao: "Moderação",
  moderacao_contestada: "Moderação contestada",
  suporte: "Chamado de suporte",
  avaliacao_denunciada: "Avaliação denunciada",
};
export const PLAN_REASON_LABELS = { subiu: "subiu de plano", rebaixou: "rebaixou", cancelou: "cancelou", admin: "alterado pela administração", inicio: "início" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const str = (v) => (typeof v === "string" ? v : "");
const cents = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** Aceita só o formato esperado; evento malformado é descartado em vez de quebrar a tela. */
export function readHouseTimeline(raw) {
  const empty = { house: null, toPay: null, events: [], hasMore: false, nextBefore: null };
  if (!raw || typeof raw !== "object" || !raw.house || typeof raw.house !== "object" || typeof raw.house.id !== "string" || !UUID.test(raw.house.id)) return empty;
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .filter((e) => e && typeof e === "object" && typeof e.kind === "string" && e.kind in EVENT_LABELS && typeof e.at === "string" && Number.isFinite(Date.parse(e.at)) && typeof e.ref_id === "string" && UUID.test(e.ref_id))
    .map((e) => ({ at: e.at, kind: e.kind, refId: e.ref_id, title: str(e.title) || EVENT_LABELS[e.kind], detail: str(e.detail), amountCents: cents(e.amount_cents), status: str(e.status) }));
  const tp = raw.to_pay && typeof raw.to_pay === "object" ? raw.to_pay : null;
  const charges = (tp && Array.isArray(tp.charges) ? tp.charges : [])
    .filter((c) => c && typeof c === "object" && typeof c.id === "string" && UUID.test(c.id) && DAY.test(String(c.due_date)) && cents(c.amount_cents) !== null)
    .map((c) => ({
      id: c.id, kind: str(c.kind), description: str(c.description), amountCents: c.amount_cents, dueDate: c.due_date, status: str(c.status), overdue: c.overdue === true,
      // desconto nunca maior que a fatura nem negativo; só vale com data de término válida
      pixDiscountCents: Number.isInteger(c.pix_discount_cents) && c.pix_discount_cents > 0 && c.pix_discount_cents < c.amount_cents && DAY.test(String(c.pix_discount_until)) ? c.pix_discount_cents : 0,
      pixDiscountUntil: DAY.test(String(c.pix_discount_until)) ? c.pix_discount_until : null,
    }));
  return {
    house: { id: raw.house.id, name: str(raw.house.name) || "Casa", plan: str(raw.house.plan), createdAt: str(raw.house.created_at) },
    toPay: { totalCents: charges.reduce((a, c) => a + c.amountCents, 0), count: charges.length, charges },
    events, hasMore: raw.has_more === true && typeof raw.next_before === "string" && Number.isFinite(Date.parse(raw.next_before)),
    nextBefore: typeof raw.next_before === "string" && Number.isFinite(Date.parse(raw.next_before)) ? raw.next_before : null,
  };
}

/** Junta páginas sem repetir evento (mesmo tipo + mesmo registro + mesmo instante). */
export function mergeEvents(a, b) {
  const seen = new Set(); const out = [];
  for (const e of [...a, ...b]) { const k = `${e.kind}|${e.refId}|${e.at}`; if (!seen.has(k)) { seen.add(k); out.push(e); } }
  return out;
}

/** Filtra por tipo ("todos" mantém tudo). */
export function filterEvents(events, kind) {
  return kind && kind !== "todos" ? events.filter((e) => e.kind === kind) : events;
}

/** Texto curto do evento: plano mostra o motivo em português; os demais, o detalhe cru some (não é para leitura). */
export function eventDetail(e) {
  if (e.kind === "plano") return PLAN_REASON_LABELS[e.detail] ?? "";
  if (e.kind === "fatura_paga") return e.detail === "pix" ? "Pix" : e.detail === "card" || e.detail === "cartao" ? "cartão" : "";
  return "";
}

/** Só aceita UUID como id de casa vindo da URL (?casa=). */
export function readHouseParam(raw) {
  return typeof raw === "string" && UUID.test(raw) ? raw.toLowerCase() : null;
}
