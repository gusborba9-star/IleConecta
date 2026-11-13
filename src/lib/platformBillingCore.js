// Apresentação da cobrança da plataforma na tela da casa. A regra de negócio (atraso, tolerância, bloqueio) mora no banco;
// aqui só se lê o resultado de my_house_billing_status e se escolhe texto, cor e botões. Valores em centavos inteiros.

export const STATUS_LABELS = {
  aberta: "Em aberto",
  vencida: "Vencida",
  em_processamento: "Pagamento em análise",
  paga: "Paga",
  cancelada: "Cancelada",
  estornada: "Estornada",
};

export const KIND_LABELS = {
  plan: "Mensalidade do plano",
  extra_seat: "Vagas adicionais de equipe",
  credit_pack: "Créditos da assistente",
  highlight: "Destaque",
  boost: "Impulsionamento",
};

export const METHOD_LABELS = { pix: "Pix", card: "Cartão", card_recurring: "Cartão (guardar para as próximas)" };

export function statusLabel(s) {
  return Object.hasOwn(STATUS_LABELS, s) ? STATUS_LABELS[s] : String(s);
}

export function statusTone(s) {
  if (s === "paga") return "forest";
  if (s === "vencida") return "danger";
  if (s === "em_processamento") return "gold";
  if (s === "cancelada" || s === "estornada") return "muted";
  return "primary";
}

export function kindLabel(k) {
  return Object.hasOwn(KIND_LABELS, k) ? KIND_LABELS[k] : "Cobrança da plataforma";
}

/** "2026-11-10" -> "10/11" (sem passar por fuso). */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}` : "";
}

/** Dia anterior de uma data ISO (a data do bloqueio total é o 1º dia bloqueado; o último dia para pagar é o anterior). */
export function dayBefore(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1));
  return d.toISOString().slice(0, 10);
}

const min = (xs) => xs.filter(Boolean).sort()[0] ?? "";

/** Leitura defensiva do que o banco devolve. Nada aqui inventa valor: campo ausente vira vazio/falso. */
export function readStatus(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const level = r.level === "parcial" || r.level === "total" ? r.level : "ok";
  const charges = (Array.isArray(r.charges) ? r.charges : []).map((c) => ({
    id: String(c?.id ?? ""),
    kind: String(c?.kind ?? ""),
    description: c?.description ? String(c.description) : null,
    amountCents: Number.isFinite(Number(c?.amount_cents)) ? Number(c.amount_cents) : 0,
    dueDate: String(c?.due_date ?? ""),
    status: String(c?.status ?? "aberta"),
    toleranceEnd: String(c?.tolerance_end ?? ""),
    totalOn: String(c?.total_on ?? ""),
    methods: (Array.isArray(c?.methods) ? c.methods : []).filter((m) => Object.hasOwn(METHOD_LABELS, m)),
  })).filter((c) => c.id);
  return { houseId: r.house_id ? String(r.house_id) : null, level, overdue: r.overdue === true && charges.length > 0, charges };
}

/**
 * O card de aviso: existe SÓ enquanto a casa tem fatura em atraso (null caso contrário) e some sozinho quando a última é paga.
 *  - atraso dentro da tolerância: aviso amarelo, "pague até X para evitar a suspensão parcial";
 *  - suspensão parcial: aviso laranja/vermelho, "pague até X para evitar o bloqueio total";
 *  - bloqueio total: vermelho, "pague para reativar".
 * Pagamento em análise: o card continua (a fatura ainda não foi baixada), mas pede só para aguardar.
 */
export function alertView(status) {
  const s = status && typeof status === "object" && "houseId" in status ? status : readStatus(status);
  if (!s.overdue) return null;
  const processing = s.charges.every((c) => c.status === "em_processamento");
  const totalCents = s.charges.reduce((a, c) => a + c.amountCents, 0);
  let tone, title, text;
  if (s.level === "total") {
    tone = "danger";
    title = "Bloqueio total da casa";
    text = "Sua casa saiu da vitrine e o painel está só para consulta. Pague a fatura para reativar tudo na hora.";
  } else if (s.level === "parcial") {
    const lastDay = dayBefore(min(s.charges.map((c) => c.totalOn)));
    tone = "danger";
    title = "Suspensão parcial";
    text = `Sem vendas novas, campanhas, destaque, impulsionamento e assistente. ${lastDay ? `Pague até ${shortDate(lastDay)} para não ter o bloqueio total.` : "Pague para não ter o bloqueio total."}`;
  } else {
    const until = min(s.charges.map((c) => c.toleranceEnd));
    tone = "gold";
    title = "Fatura em atraso";
    text = until ? `Pague até ${shortDate(until)} para evitar a suspensão parcial da casa.` : "Pague para evitar a suspensão parcial da casa.";
  }
  if (processing) text = "Recebemos o seu pagamento e ele está em análise. Assim que for confirmado, o aviso some sozinho.";
  return { tone, title, text, totalCents, processing, level: s.level, charges: s.charges };
}

/** Pagar só faz sentido para fatura em aberto ou vencida. */
export function canPay(charge) {
  return charge?.status === "aberta" || charge?.status === "vencida";
}
