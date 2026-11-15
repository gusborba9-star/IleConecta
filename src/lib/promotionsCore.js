// Destaque e impulsionamento (Blueprint §17): leitura segura dos dados do banco e textos de contador. Puro e testável.
export const PROMO_SCOPES = ["cidade", "estado", "pais"];
export const SCOPE_NAME = { cidade: "Cidade", estado: "Estado", pais: "País" };
export const KIND_NAME = { boost: "Impulsionamento", highlight: "Destaque" };

const num = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (typeof v === "string" && v ? v : null);

/** Normaliza a lista de compras da casa (nunca confia no formato). */
export function readMyPromotions(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(r.items) ? r.items : [];
  const items = list.flatMap((i) => {
    if (!i || typeof i !== "object" || !str(i.id) || (i.kind !== "boost" && i.kind !== "highlight") || !PROMO_SCOPES.includes(i.scope)) return [];
    return [{
      id: String(i.id), kind: i.kind, scope: i.scope, itemType: str(i.item_type), itemId: str(i.item_id), title: str(i.title),
      days: num(i.days) ?? 0, status: String(i.status ?? ""), chargeId: str(i.charge_id), paidCents: num(i.paid_cents),
      startsAt: str(i.starts_at), endsAt: str(i.ends_at), running: i.running === true, queued: i.queued === true, paused: i.paused === true,
      daysLeft: num(i.days_left), daysUsed: num(i.days_used), refundCents: num(i.refund_cents), refundDays: num(i.refund_days), refundDeadline: str(i.refund_deadline),
    }];
  });
  return { hasHouse: r.has_house === true, items };
}

/** Vagas do destaque por alcance. */
export function readAvailability(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = r.scopes && typeof r.scopes === "object" ? r.scopes : {};
  const out = {};
  for (const k of PROMO_SCOPES) {
    const v = s[k] && typeof s[k] === "object" ? s[k] : {};
    out[k] = { limit: num(v.limit) ?? 0, taken: num(v.taken) ?? 0, full: v.full === true, mine: v.mine === true, waiting: v.waiting === true, located: v.located !== false };
  }
  return { hasHouse: r.has_house === true, scopes: out };
}

const TZ = "America/Sao_Paulo";
/** "15/11 às 22:03" no horário de Brasília. */
export function endsLabel(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

/** Contador: "3 d 4 h", "5 h 12 min", "8 min", "menos de 1 min". */
export function countdownText(iso, now = Date.now()) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "";
  const s = Math.floor((t - now) / 1000);
  if (s <= 0) return "encerrado";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return "menos de 1 min";
}

/** Frase do card da casa: situação + fim exato + dias restantes. */
export function promoLine(i, now = Date.now()) {
  if (i.paused) return "Pausado enquanto houver pendência na conta. O tempo volta a correr quando regularizar.";
  if (i.queued) return `Na fila: começa quando o anterior terminar (${endsLabel(i.startsAt)}).`;
  if (i.status !== "ativa") return i.status === "reembolsada" ? "Reembolsado." : "Encerrado.";
  const left = i.daysLeft;
  const days = left === null ? "" : left <= 1 ? "último dia" : `${left} dias restantes`;
  return `Termina em ${endsLabel(i.endsAt)} (${countdownText(i.endsAt, now)})${days ? ` · ${days}` : ""}`;
}

/** Texto do reembolso, só para "Pedidos e validações": dias que ainda não começaram e valor. */
export function promoRefundText(i, money) {
  if (i.refundCents === null || i.refundDays === null) return "";
  return `${i.refundDays} ${i.refundDays === 1 ? "dia" : "dias"} que ainda não começaram: ${money(i.refundCents)}`;
}

/** Texto curto do que foi comprado. */
export function promoName(i) {
  const where = SCOPE_NAME[i.scope] ?? i.scope;
  return i.kind === "highlight" ? `Destaque da casa · ${where}` : `Impulso de ${i.title ?? "item removido"} · ${where}`;
}

/** Edição livre do campo de dias (1 a 90): devolve o texto a mostrar e os dias válidos (null enquanto o campo está vazio ou zerado). */
export function editDaysDraft(raw, cap = 90) {
  const digits = String(raw ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
  if (digits === "") return { text: "", days: null };
  const n = Number(digits);
  if (n < 1) return { text: digits, days: null };
  const limit = Math.max(1, Math.min(90, cap));
  return n > limit ? { text: String(limit), days: limit } : { text: digits, days: n };
}
