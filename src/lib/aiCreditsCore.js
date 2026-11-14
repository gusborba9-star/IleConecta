// Créditos de IA da casa: franquia do mês, saldo dos pacotes e o que está à venda (a conta é feita no banco).

export const PACK_ORDER = ["p80", "p200", "p500"];
export const PACK_SIZE = { p80: 80, p200: 200, p500: 500 };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Resposta do banco → formato seguro para a tela. Sem casa ou resposta fora do formato: null. */
export function readCredits(raw) {
  if (!raw || typeof raw !== "object" || raw.has_house !== true) return null;
  const prices = raw.prices && typeof raw.prices === "object" ? raw.prices : {};
  return {
    limit: Math.max(0, Math.trunc(num(raw.limit))),
    used: Math.max(0, Math.trunc(num(raw.used_month))),
    balance: Math.max(0, Math.trunc(num(raw.balance))),
    forSale: raw.for_sale === true,
    packs: (Array.isArray(raw.packs) ? raw.packs : [])
      .filter((p) => p && typeof p.expires_at === "string")
      .map((p) => ({ size: Math.trunc(num(p.size)), remaining: Math.max(0, Math.trunc(num(p.remaining))), expiresAt: p.expires_at })),
    offers: PACK_ORDER.filter((k) => Number.isFinite(Number(prices[k])) && Number(prices[k]) > 0).map((k) => ({ key: k, size: PACK_SIZE[k], priceCents: Number(prices[k]) })),
  };
}

/** Franquia do mês: restante, percentual e tom do aviso (80% amarelo, esgotada vermelho). */
export function franchiseView(c) {
  if (!c || c.limit <= 0) return null;
  const used = Math.min(c.used, c.limit);
  const pct = Math.floor((used * 100) / c.limit);
  const over = Math.max(0, c.used - c.limit);
  const exhausted = c.used >= c.limit;
  return { used, limit: c.limit, left: Math.max(0, c.limit - c.used), pct, over, exhausted, tone: exhausted ? "danger" : used * 100 >= c.limit * 80 ? "gold" : "forest" };
}

/** Texto curto de situação: o que acontece agora com a assistente. */
export function statusText(c) {
  const f = franchiseView(c);
  if (!f) return "O plano da casa não inclui a assistente.";
  if (!f.exhausted) return `Restam ${f.left} respostas da franquia deste mês.`;
  if (c.balance > 0) return `A franquia do mês acabou. A assistente segue com os seus créditos (${c.balance} respostas).`;
  return "A franquia do mês acabou. A assistente pausa até o próximo mês, ou até você comprar créditos.";
}

export function expiryText(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const days = Math.ceil((t - now) / 86_400_000);
  const d = new Date(t);
  const date = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  if (days <= 0) return `venceu em ${date}`;
  if (days <= 7) return `vence em ${days} ${days === 1 ? "dia" : "dias"} (${date})`;
  return `vale até ${date}`;
}

export function offerLabel(o) {
  return `${o.size} respostas`;
}

/** Leitura segura da tela de reembolso (my_credit_refunds): só números e datas, tudo validado. */
export function readRefunds(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const n = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
  const items = (Array.isArray(r.items) ? r.items : [])
    .map((i) => ({ chargeId: String(i?.charge_id ?? ""), size: n(i?.size), remaining: n(i?.remaining), paidCents: n(i?.paid_cents), refundCents: n(i?.refund_cents), deadline: String(i?.deadline ?? "") }))
    .filter((i) => /^[0-9a-f-]{36}$/i.test(i.chargeId) && i.size && i.remaining && i.refundCents && i.refundCents > 0);
  const history = (Array.isArray(r.history) ? r.history : [])
    .map((h) => ({ amountCents: n(h?.amount_cents), credits: n(h?.credits), status: h?.status === "concluido" ? "concluido" : "pendente", at: String(h?.at ?? "") }))
    .filter((h) => h.amountCents && h.credits);
  return { items, history, windowDays: n(r.window_days) ?? 7 };
}

/** Texto do reembolso: diz o valor, quantas respostas voltam e até quando vale (pelo relógio de Brasília). */
export function refundText(i, now = Date.now()) {
  const money = `R$ ${(i.refundCents / 100).toFixed(2).replace(".", ",")}`;
  const used = i.size - i.remaining;
  const ms = Date.parse(i.deadline) - now;
  const days = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86400000)) : null;
  const left = days === null ? "" : days <= 1 ? " Último dia para pedir." : ` Faltam ${days} dias para pedir.`;
  return {
    money,
    line: used === 0 ? `Nada usado deste pacote: devolvemos ${money} (valor integral).${left}` : `${used} de ${i.size} respostas já usadas: devolvemos ${money} pelas ${i.remaining} não usadas.${left}`,
  };
}

/** Reembolso do primeiro pagamento do plano (my_plan_refund): leitura defensiva do que o banco devolve. */
export function readPlanRefund(raw) {
  const r = raw && typeof raw === "object" ? raw : null;
  if (!r || r.has_house !== true) return null;
  const cents = Number(r.amount_cents);
  const history = Array.isArray(r.history) ? r.history : [];
  return {
    cancelled: r.cancelled === true,
    returning: r.returning === true,
    refundBlocked: r.refund_blocked === true,
    eligible: r.eligible === true && typeof r.charge_id === "string" && Number.isFinite(cents) && cents > 0,
    chargeId: typeof r.charge_id === "string" ? r.charge_id : null,
    amountCents: Number.isFinite(cents) ? cents : 0,
    deadline: typeof r.deadline === "string" ? r.deadline : "",
    windowDays: Number(r.window_days) > 0 ? Number(r.window_days) : 7,
    history: history.map((h) => ({ at: String(h?.at ?? ""), status: h?.status === "concluido" ? "concluido" : h?.status === "falhou" ? "falhou" : "pendente", amountCents: Number(h?.amount_cents) || 0 })),
  };
}

export function planRefundText(p, now = Date.now()) {
  const money = `R$ ${(p.amountCents / 100).toFixed(2).replace(".", ",")}`;
  const ms = Date.parse(p.deadline) - now;
  const days = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86400000)) : null;
  const left = days === null ? "" : days <= 1 ? " Último dia para pedir." : ` Faltam ${days} dias para pedir.`;
  return { money, line: `Primeiro pagamento do plano: devolvemos ${money} (valor integral).${left}` };
}

/** Texto mostrado quando uma conta anterior do mesmo e-mail (excluída) já usou o reembolso de 7 dias. */
export const RETURNING_REFUND_TEXT = "Conta reutilizada: o reembolso de 7 dias do plano já foi utilizado em uma conta anterior vinculada a este e-mail e não é concedido novamente.";
