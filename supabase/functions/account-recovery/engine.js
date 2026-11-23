// Motor de recomendação da recuperação de acesso (Blueprint §18, 23/11/2026).
// Núcleo PURO: sem rede, sem banco, sem IA. Regras fixas e explicáveis; mesma entrada dá sempre a mesma saída.
// Duas fases: (1) identificar a conta provável pelo que a pessoa informou; (2) comparar as respostas com o que a conta contém.
// Nunca devolve dado real da conta: os motivos dizem só "confere / parecido / não confere / não respondeu".
// "Não lembro" (ou vazio) é neutro: não soma e não penaliza. Nunca recomenda aprovar sem prova forte.

export const DEFAULT_SCORING = {
  weights: { word: 40, email: 25, last_tx: 25, signup: 15, members: 15, top_houses: 20, last_access: 10, assistant_name: 8, plan: 6, had_tx: 4, uses_assistant: 4, staff: 4, name: 3, city: 2 },
  strong: ["word", "email", "last_tx", "signup", "members", "top_houses"],
  approve: { minStrongHits: 2, minRatio: 0.75 },
  second: { minStrongHits: 1, minRatio: 0.5 },
  minAnswered: 4,
  candidateMinId: 0.5,
  ambiguityGap: 0.1,
};

const LABELS = {
  word: "Palavra de segurança", email: "E-mail que lembra", last_tx: "Última transação", signup: "Mês do cadastro", members: "Quantidade de membros",
  top_houses: "Casas com quem mais conversou", last_access: "Mês do último acesso", assistant_name: "Nome da assistente", plan: "Plano da casa",
  had_tx: "Já fez transações", uses_assistant: "Usa a assistente", staff: "Tem equipe", name: "Nome", city: "Cidade",
};

const blank = (v) => v === undefined || v === null || v === "" || v === "nao_lembro";

export function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function bigrams(s) {
  const t = ` ${s} `;
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) ?? 0) + 1); }
  return out;
}

/** Semelhança de textos 0..1 (coeficiente de Dice por pares de letras): tolera erro de digitação, acento e maiúscula. */
export function textSim(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const gx = bigrams(x), gy = bigrams(y);
  let inter = 0, nx = 0, ny = 0;
  for (const [, n] of gx) nx += n;
  for (const [, n] of gy) ny += n;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0);
  return (2 * inter) / (nx + ny);
}

/** Mesma regra da função email_key do banco: sem +apelido e, no gmail, sem pontos. */
export function emailKey(email) {
  const e = String(email ?? "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1) return "";
  let local = e.slice(0, at).split("+")[0];
  const host = e.slice(at + 1);
  if (host === "gmail.com" || host === "googlemail.com") return `${local.replace(/\./g, "")}@gmail.com`;
  return `${local}@${host}`;
}

/** E-mail lembrado (pode ser aproximado, ex.: "ma***@gmail.com" ou só "maria silva gmail") contra um e-mail real. */
export function emailSim(typed, real) {
  const t = String(typed ?? "").trim().toLowerCase();
  if (!t || !real) return 0;
  if (emailKey(t) && emailKey(t) === emailKey(real)) return 1;
  const [rLocalRaw, rHost = ""] = String(real).toLowerCase().split("@");
  const rLocal = emailKey(real).split("@")[0] || rLocalRaw;
  const at = t.indexOf("@");
  const tLocalRaw = (at >= 0 ? t.slice(0, at) : t).split("+")[0];
  const tLocal = tLocalRaw.replace(/[^a-z0-9._-]/g, "").replace(/\./g, "");
  const tHost = at >= 0 ? t.slice(at + 1).replace(/[^a-z0-9.-]/g, "") : "";
  let local;
  if (/[*…]/.test(tLocalRaw) || /\.\.\./.test(tLocalRaw)) {
    const prefix = tLocalRaw.split(/[*…]|\.\.\./)[0].replace(/[^a-z0-9]/g, "");
    local = prefix.length >= 2 && rLocal.replace(/[^a-z0-9]/g, "").startsWith(prefix) ? 0.5 + Math.min(0.3, prefix.length * 0.05) : 0;
  } else {
    local = textSim(tLocal, rLocal.replace(/\./g, ""));
  }
  const host = tHost ? (tHost === rHost ? 1 : tHost.split(".")[0] === rHost.split(".")[0] ? 0.8 : 0) : 0.5;
  return Math.max(0, Math.min(1, local * 0.75 + host * 0.25));
}

const monthIndex = (ym) => { const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? "")); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null; };
const dateIndex = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t.getUTCFullYear() * 12 + t.getUTCMonth() : null; };
function monthMatch(typedYm, actualDate, tol) {
  const a = monthIndex(typedYm), b = dateIndex(actualDate);
  if (a === null || b === null) return null;
  const d = Math.abs(a - b);
  return d <= tol[0] ? 1 : d <= tol[1] ? 0.7 : d <= tol[2] ? 0.4 : 0;
}
const num = (v) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
function countMatch(typed, actual) {
  const t = num(typed);
  if (t === null) return null;
  if (t === actual) return 1;
  const rel = Math.abs(t - actual) / Math.max(1, actual, t);
  return rel <= 0.2 ? 1 : rel <= 0.5 ? 0.5 : 0;
}
const boolMatch = (typed, actual) => (typed === "sim" || typed === "nao" ? (typed === "sim") === Boolean(actual) : null);

/** Cada critério devolve undefined (não se aplica a este tipo de conta: nem aparece), null (não respondeu) ou 0..1. */
function criteria(claimed, answers, f, wordState) {
  const isHouse = f.type === "casa";
  const out = {};
  out.word = wordState === "ok" ? 1 : wordState === "wrong" ? 0 : null;
  out.email = blank(claimed.old_email) ? null : Math.max(0, ...(f.emails ?? []).map((e) => emailSim(claimed.old_email, e)));
  out.name = blank(claimed.name) ? null : Math.max(textSim(claimed.name, f.name), isHouse ? textSim(claimed.name, f.house_name) : 0);
  out.city = blank(claimed.city) ? null : textSim(claimed.city, f.city);
  out.signup = blank(answers.signup_month) ? null : monthMatch(answers.signup_month, f.created_at, [1, 2, 4]);
  out.last_access = blank(answers.last_access_month) ? null : monthMatch(answers.last_access_month, f.last_activity_at, [1, 2, 4]);
  out.had_tx = boolMatch(answers.had_tx, (f.tx?.count ?? 0) > 0);
  // última transação: só vale se disse que fez; se disse que não fez e fez (ou o contrário) é 0
  const subs = [];
  if (answers.had_tx === "sim" && (f.tx?.count ?? 0) === 0) subs.push(0);
  else if (answers.had_tx === "sim") {
    if (!blank(answers.last_tx_kind)) subs.push(norm(answers.last_tx_kind) === norm(f.tx.last_kind) ? 1 : 0);
    if (!blank(answers.last_tx_value)) { const v = num(answers.last_tx_value); subs.push(v === null ? null : countMatch(v, (f.tx.last_value_cents ?? 0) / 100)); }
    if (!blank(answers.last_tx_month)) subs.push(monthMatch(answers.last_tx_month, f.tx.last_at, [0, 1, 3]));
  } else if (answers.had_tx === "nao" && (f.tx?.count ?? 0) > 0) subs.push(0);
  const got = subs.filter((x) => x !== null);
  out.last_tx = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
  out.members = !isHouse ? undefined : answers.has_members === "nao" ? ((f.members_count ?? 0) === 0 ? 1 : 0) : blank(answers.members_count) ? null : countMatch(answers.members_count, f.members_count ?? 0);
  out.top_houses = isHouse ? undefined : !Array.isArray(answers.top_houses) || !answers.top_houses.filter((x) => !blank(x)).length ? null
    : (() => { const typed = answers.top_houses.filter((x) => !blank(x)); const real = f.top_house_names ?? [];
      const hits = typed.filter((t) => real.some((r) => textSim(t, r) >= 0.75)).length; return hits / typed.length; })();
  out.assistant_name = !isHouse ? undefined : blank(answers.assistant_name) ? null : textSim(answers.assistant_name, f.assistant_name);
  out.plan = !isHouse ? undefined : blank(answers.plan) ? null : norm(answers.plan) === norm(f.plan) ? 1 : 0;
  out.uses_assistant = !isHouse ? undefined : boolMatch(answers.uses_assistant, f.uses_assistant);
  out.staff = !isHouse ? undefined : boolMatch(answers.has_staff, f.has_staff);
  return out;
}

/** Fase 1: quão provável é que esta conta seja a que a pessoa descreve (0..1). Tipo diferente elimina. */
export function identificationScore(claimed, f) {
  if (claimed.type && f.type && claimed.type !== f.type) return 0;
  const c = criteria(claimed, {}, f, "not_answered");
  const parts = [[c.email, 0.45], [c.name, 0.3], [c.city, 0.1]].filter(([v]) => v !== null);
  if (!parts.length) return 0;
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const s = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
  const strongId = (c.email ?? 0) >= 0.6 || (c.name ?? 0) >= 0.75;
  return strongId ? s : s * 0.5;
}

/**
 * candidates: [{ facts, wordState }]  wordState: "ok" | "wrong" | "none_set" | "not_answered"
 * Devolve a recomendação e os motivos da melhor candidata; para as demais só id e pontuação de identificação.
 */
export function evaluate({ claimed = {}, answers = {}, round = 1 }, candidates = [], scoring = DEFAULT_SCORING) {
  const S = { ...DEFAULT_SCORING, ...scoring, weights: { ...DEFAULT_SCORING.weights, ...(scoring.weights ?? {}) },
    approve: { ...DEFAULT_SCORING.approve, ...(scoring.approve ?? {}) }, second: { ...DEFAULT_SCORING.second, ...(scoring.second ?? {}) } };
  const ranked = candidates.map((c) => ({ c, id: identificationScore(claimed, c.facts) })).filter((x) => x.id >= S.candidateMinId).sort((a, b) => b.id - a.id);
  const list = ranked.slice(0, 3).map((x) => ({ user_id: x.c.facts.user_id, id_score: Number(x.id.toFixed(3)) }));
  if (!ranked.length) return { lane: "sem_conta", recommendation: "recusar", candidates: [], best: null, reasons: [{ code: "sem_conta", label: "Nenhuma conta combina com o que foi informado", result: "nao_confere" }] };

  const top = ranked[0];
  const ambiguous = ranked.length > 1 && top.id - ranked[1].id < S.ambiguityGap;
  const crit = criteria(claimed, answers, top.c.facts, top.c.wordState);
  let earned = 0, possible = 0, strongHits = 0, strongMiss = 0, answered = 0;
  const reasons = [];
  for (const [k, v] of Object.entries(crit)) {
    if (v === undefined) continue;
    const w = S.weights[k] ?? 0;
    if (v === null) { reasons.push({ code: k, label: LABELS[k], result: "nao_respondeu" }); continue; }
    const isId = k === "name" || k === "city";
    if (!isId) answered++;
    earned += w * v; possible += w;
    const strong = S.strong.includes(k);
    if (strong && v >= 0.8) strongHits++;
    if (strong && v < 0.3) strongMiss++;
    reasons.push({ code: k, label: LABELS[k], weight: w, strong, result: v >= 0.8 ? "confere" : v >= 0.4 ? "parecido" : "nao_confere" });
  }
  const ratio = possible ? earned / possible : 0;
  const metrics = { user_id: top.c.facts.user_id, id_score: Number(top.id.toFixed(3)), ratio: Number(ratio.toFixed(3)), strong_hits: strongHits, strong_miss: strongMiss, answered };

  let rec;
  if (answered < S.minAnswered) rec = "insuficiente";
  else if (strongMiss > 0 && strongMiss >= strongHits) rec = "recusar";
  else if (ambiguous) rec = round === 1 ? "segunda_rodada" : "recusar";
  else if (strongHits >= S.approve.minStrongHits && ratio >= S.approve.minRatio && strongMiss === 0) rec = "aprovar";
  else if (strongHits >= S.second.minStrongHits && ratio >= S.second.minRatio) rec = round === 1 ? "segunda_rodada" : "recusar";
  else rec = "recusar";
  if (ambiguous) reasons.push({ code: "ambigua", label: "Mais de uma conta parecida com o que foi informado", result: "parecido" });
  return { lane: "normal", recommendation: rec, candidates: list, best: metrics, reasons };
}
