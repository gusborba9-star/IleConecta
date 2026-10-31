// Regras do calendário religioso da casa (puras, sem React). Datas sempre como texto "AAAA-MM-DD", sem fuso.

export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Os quatro interruptores de visibilidade de cada data. A casa decide tudo, data a data. */
export const VISIBILITY = [
  { key: "vis_public", label: "Público (rede)", hint: "aparece na página pública da casa, para todos" },
  { key: "vis_followers", label: "Seguidores", hint: "quem segue a casa vê" },
  { key: "vis_house", label: "Casa", hint: "fica no calendário interno da casa" },
  { key: "vis_assistant", label: "Assistente", hint: "a assistente pode responder sobre esta data" },
];

/** Tipos de data, com a sugestão inicial dos interruptores (a casa sempre pode mudar). Obrigações nascem só internas. */
export const KINDS = [
  { id: "celebracao", label: "Celebração", vis: { vis_public: true, vis_followers: true, vis_house: true, vis_assistant: true } },
  { id: "obrigacao", label: "Obrigação", vis: { vis_public: false, vis_followers: false, vis_house: true, vis_assistant: false } },
  { id: "gira", label: "Gira / toque", vis: { vis_public: true, vis_followers: true, vis_house: true, vis_assistant: true } },
  { id: "outro", label: "Outra", vis: { vis_public: false, vis_followers: false, vis_house: true, vis_assistant: false } },
];
export const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label ?? "Outra";
export const kindDefaultVisibility = (id) => ({ ...(KINDS.find((k) => k.id === id)?.vis ?? KINDS[3].vis) });

/** Tradições com sugestões. Cada casa observa datas diferentes: o catálogo é só um ponto de partida e sempre editável. */
export const TRADITIONS = ["Umbanda", "Candomblé", "Quimbanda"];

/**
 * Sugestões amplamente reconhecidas. Em todas a data "varia por casa e por região": a casa confere e ajusta.
 * Quimbanda fica sem sugestões de propósito (não há datas comuns a todas as casas): cada casa cadastra as suas.
 */
export const SUGGESTIONS = [
  { key: "oxossi", title: "Dia de Oxóssi", month: 1, day: 20, traditions: ["Umbanda", "Candomblé"] },
  { key: "iemanja", title: "Festa de Iemanjá", month: 2, day: 2, traditions: ["Umbanda", "Candomblé"] },
  { key: "ogum", title: "Dia de Ogum", month: 4, day: 23, traditions: ["Umbanda", "Candomblé"] },
  { key: "pretos-velhos", title: "Dia dos Pretos-Velhos", month: 5, day: 13, traditions: ["Umbanda"] },
  { key: "cosme-damiao", title: "Cosme e Damião (Erês e Ibejis)", month: 9, day: 27, traditions: ["Umbanda", "Candomblé"] },
  { key: "iansa", title: "Dia de Iansã", month: 12, day: 4, traditions: ["Umbanda", "Candomblé"] },
  { key: "oxum", title: "Dia de Oxum", month: 12, day: 8, traditions: ["Umbanda", "Candomblé"] },
];

/** Sugestões da tradição (já em ordem de relevância), sem as que a casa já cadastrou, no máximo `limit`. */
export const suggestionsFor = (tradition, taken = [], limit = 6) =>
  SUGGESTIONS.filter((s) => s.traditions.includes(tradition) && !taken.includes(s.title)).slice(0, limit);

/** "Datas tradicionais": lista única, sem separar por tradição. A casa confere e ajusta; nenhuma casa fica de fora. */
export const traditionalDates = (taken = [], limit = 8) => SUGGESTIONS.filter((s) => !taken.includes(s.title)).slice(0, limit);

const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Texto "AAAA-MM-DD" válido (rejeita 31 de abril, 30 de fevereiro etc.) → {y,m,d}; senão null. */
export function parseDate(text) {
  const m = DATE_RE.exec(String(text ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}

const toDays = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

/** Próxima ocorrência a partir de hoje (inclusive). Data anual cai em 28/02 em ano não bissexto se era 29/02. Sem repetição e já passada → null. */
export function nextOccurrence(item, today) {
  const t = parseDate(today);
  const base = parseDate(item.date);
  if (!t || !base) return null;
  if (!item.yearly) return toDays(base.y, base.m, base.d) >= toDays(t.y, t.m, t.d) ? `${base.y}-${pad(base.m)}-${pad(base.d)}` : null;
  for (const y of [t.y, t.y + 1]) {
    let { m, d } = base;
    if (m === 2 && d === 29 && !parseDate(`${y}-02-29`)) d = 28;
    if (toDays(y, m, d) >= toDays(t.y, t.m, t.d)) return `${y}-${pad(m)}-${pad(d)}`;
  }
  return null;
}

export function daysUntil(dateText, today) {
  const a = parseDate(dateText);
  const t = parseDate(today);
  return a && t ? toDays(a.y, a.m, a.d) - toDays(t.y, t.m, t.d) : null;
}

/** "2 de fevereiro" (com o ano só quando a data não se repete). */
export function formatDay(dateText, withYear = false) {
  const p = parseDate(dateText);
  if (!p) return "";
  return `${p.d} de ${MONTHS[p.m - 1]}${withYear ? ` de ${p.y}` : ""}`;
}

export function whenLabel(days) {
  if (days === null) return "";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

/** Itens com a próxima data, do mais próximo ao mais distante; os que não ocorrem mais vão ao fim. */
export function upcoming(items, today) {
  return items
    .map((it) => ({ ...it, next: nextOccurrence(it, today) }))
    .sort((a, b) => (a.next && b.next ? a.next.localeCompare(b.next) || a.title.localeCompare(b.title) : a.next ? -1 : b.next ? 1 : 0));
}

/** Hoje no relógio local do aparelho, como "AAAA-MM-DD". */
export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
