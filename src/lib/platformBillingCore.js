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

/** Botões de pagamento de uma fatura: "cartão recorrente" não é um botão (o cartão salvo é um cadastro à parte); vira cartão comum, sem repetir. */
export function payMethods(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const k = m === "card_recurring" ? "card" : m;
    if ((k === "pix" || k === "card") && !out.includes(k)) out.push(k);
  }
  return out;
}

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
    methods: payMethods(c?.methods),
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
export function alertView(status, opts = {}) {
  const s = status && typeof status === "object" && "houseId" in status ? status : readStatus(status);
  if (!s.overdue) return null;
  const processing = s.charges.every((c) => c.status === "em_processamento");
  const totalCents = s.charges.reduce((a, c) => a + c.amountCents, 0);
  let tone, title, text;
  if (s.level === "total") {
    tone = "danger";
    title = "Bloqueio total da casa";
    text = "Sua casa está bloqueada e fora da vitrine. Pague a fatura para reativar tudo na hora.";
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
  // conta inativa (assinatura encerrada) com fatura vencida: pagar a dívida não reativa a casa, só libera a escolha do plano
  if (opts?.inactive === true) {
    tone = "gold";
    title = "Fatura vencida";
    text = "Pague a fatura. Depois de quitar, escolha um plano para reativar a conta.";
  }
  if (processing) text = "Recebemos o seu pagamento e ele está em análise. Assim que for confirmado, o aviso some sozinho.";
  return { tone, title, text, totalCents, processing, level: s.level, charges: s.charges };
}

/** Pagar só faz sentido para fatura em aberto ou vencida. */
export function canPay(charge) {
  return charge?.status === "aberta" || charge?.status === "vencida";
}

const BRANDS = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", elo: "Elo", hipercard: "Hipercard", diners: "Diners", discover: "Discover", jcb: "JCB", unionpay: "UnionPay" };
const OUTCOME_TEXT = {
  aprovada: "cobrança aprovada",
  processando: "pagamento em análise no banco",
  recusada: "o banco recusou a cobrança",
  exige_acao: "o banco pediu uma confirmação extra",
};

/** Texto do cartão salvo para a casa. O banco decide tudo; aqui só se descreve. */
export function cardView(status, todayIso = new Date().toISOString().slice(0, 10)) {
  if (!status || status.hasHouse === false || status.available !== true) return null;
  const hasCard = status.hasCard === true && status.last4;
  const brand = status.brand ? (Object.hasOwn(BRANDS, status.brand) ? BRANDS[status.brand] : "Cartão") : "Cartão";
  const exp = status.expMonth && status.expYear ? `${String(status.expMonth).padStart(2, "0")}/${String(status.expYear).slice(-2)}` : null;
  const expired = Boolean(exp) && `${status.expYear}-${String(status.expMonth).padStart(2, "0")}` < todayIso.slice(0, 7);
  const last = status.lastAttempt && Object.hasOwn(OUTCOME_TEXT, status.lastAttempt.outcome) ? status.lastAttempt : null;
  const problem = last && (last.outcome === "recusada" || last.outcome === "exige_acao") ? `Última tentativa (${last.attempt} de ${status.maxAttempts}): ${OUTCOME_TEXT[last.outcome]}. Pague a fatura ou troque o cartão.` : null;
  return {
    hasCard: Boolean(hasCard),
    title: hasCard ? `${brand} final ${status.last4}` : "Nenhum cartão cadastrado",
    expiry: exp ? `validade ${exp}` : null,
    expired,
    on: Boolean(hasCard) && status.autoEnabled === true,
    summary: !hasCard
      ? "Cadastre um cartão para a mensalidade e as vagas extras serem cobradas sozinhas no vencimento."
      : status.autoEnabled ? `A mensalidade e as vagas extras são cobradas sozinhas no cartão, no dia do vencimento. Se o banco recusar, tentamos de novo nos 2 dias seguintes (até ${status.maxAttempts} tentativas).` : "Cobrança automática desligada. As faturas continuam podendo ser pagas por Pix ou cartão.",
    problem,
    lastText: last && !problem ? `Última cobrança automática: ${OUTCOME_TEXT[last.outcome]}.` : null,
  };
}

const BRL = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Texto da caixa de autorização de cobrança automática (nunca pré-marcada). É este texto exato que fica gravado como prova.
 * planName/amountCents vazios = a casa ainda não tem plano pago: a autorização vale para o plano e as vagas extras que ela contratar.
 */
export function authorizationText({ planName, amountCents } = {}) {
  const ok = typeof planName === "string" && planName.trim() !== "" && Number.isInteger(amountCents) && amountCents > 0;
  const what = ok
    ? `no valor de ${BRL(amountCents)} a cada mês no cartão de crédito informado, referente ao plano ${planName.trim()} (e às vagas extras de equipe que eu contratar nele)`
    : "no valor da mensalidade do plano e das vagas extras de equipe que eu contratar, a cada mês, no cartão de crédito informado";
  return {
    period: "mensal",
    planKey: ok ? planName.trim().toLowerCase().slice(0, 40) : null,
    amountCents: ok ? amountCents : null,
    text: `Li e concordo com os Termos de Uso do Ilê Conecta e autorizo a cobrança automática recorrente ${what}, até que eu solicite o cancelamento. Posso desligar a cobrança automática ou remover o cartão quando quiser.`,
  };
}
