// Pessoas da casa: lê e valida o que vem do banco (0131) antes de mostrar. O banco já filtra por casa e permissão;
// aqui só se aceita o formato esperado e se descarta o resto, sem quebrar a tela.
export const SEGMENTS = ["todos", "seguidor", "conversou", "interessado", "cliente", "recorrente", "participante", "membro", "pendencia", "sumido"];
export const SEGMENT_LABELS = {
  todos: "Todas", seguidor: "Seguidores", conversou: "Conversaram", interessado: "Interessados", cliente: "Clientes", recorrente: "Recorrentes",
  participante: "Participantes de ritual", membro: "Membros", pendencia: "Com pendência", sumido: "Sem contato há 90 dias",
};
export const SEGMENT_HINTS = {
  todos: "Todas as pessoas com relação com a sua casa.",
  seguidor: "Seguem a casa.",
  conversou: "Já mandaram mensagem para a casa.",
  interessado: "Começaram um pedido ou reserva, mas não pagaram.",
  cliente: "Têm ao menos um pedido pago ou reserva confirmada.",
  recorrente: "Duas ou mais compras.",
  participante: "Têm reserva confirmada em ritual.",
  membro: "Estão na lista de membros da casa.",
  pendencia: "Esperam algo da casa: resposta, início de pedido ou mensalidade vencida.",
  sumido: "Já compraram, mas sem nenhuma atividade há mais de 90 dias.",
};
export const EVENT_LABELS = {
  seguiu: "Seguiu a casa", conversa: "Conversa", mensagem: "Mensagem", assistente_passada_para_casa: "Assistente passou o assunto", assistente_assumida: "Casa assumiu a conversa",
  assistente_devolvida: "Conversa devolvida", pedido: "Pedido", pedido_concluido: "Pedido concluído", reserva: "Reserva em ritual", membro: "Membro", membro_saiu: "Saiu dos membros",
  mensalidade: "Mensalidade", avaliacao: "Avaliação", reembolso: "Reembolso",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v) => (typeof v === "string" ? v : "");
const intOrNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const isoOrNull = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const segs = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s !== "todos" && SEGMENTS.includes(s)) : []);

function readPerson(p) {
  return {
    personId: p.person_id, name: str(p.name).trim() || "Pessoa", avatarUrl: /^https:\/\//i.test(str(p.avatar_url)) ? p.avatar_url : null,
    city: str(p.city) || null, state: str(p.state) || null, segments: segs(p.segments), purchases: int(p.purchases),
    spentCents: intOrNull(p.spent_cents), firstAt: isoOrNull(p.first_at), lastAt: isoOrNull(p.last_at),
  };
}

/** Lista de pessoas e contagem por segmento. */
export function readHousePeople(raw) {
  const empty = { role: "titular", segment: "todos", total: 0, counts: {}, items: [] };
  if (!raw || typeof raw !== "object") return empty;
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((p) => p && typeof p === "object" && typeof p.person_id === "string" && UUID.test(p.person_id)).map(readPerson);
  const counts = {};
  if (raw.counts && typeof raw.counts === "object") for (const s of SEGMENTS) counts[s] = int(raw.counts[s]);
  return { role: raw.role === "equipe" ? "equipe" : "titular", segment: SEGMENTS.includes(raw.segment) ? raw.segment : "todos", total: int(raw.total), counts, items };
}

/** Linha do tempo de uma pessoa: só tipos conhecidos, do mais novo ao mais antigo. */
export function readPersonTimeline(raw) {
  if (!raw || typeof raw !== "object" || !raw.person || typeof raw.person !== "object" || typeof raw.person.person_id !== "string" || !UUID.test(raw.person.person_id)) return null;
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .filter((e) => e && typeof e === "object" && typeof e.kind === "string" && e.kind in EVENT_LABELS && isoOrNull(e.at))
    .map((e) => ({ at: e.at, kind: e.kind, refId: typeof e.ref_id === "string" && UUID.test(e.ref_id) ? e.ref_id : null, title: str(e.title) || EVENT_LABELS[e.kind], detail: str(e.detail) || null }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { role: raw.role === "equipe" ? "equipe" : "titular", person: readPerson(raw.person), events };
}

/** Quando foi, em palavras curtas ("hoje", "ontem", "há 3 dias", "há 2 meses"). */
export function agoText(iso, now = new Date()) {
  const t = Date.parse(iso ?? "");
  if (Number.isNaN(t)) return "";
  const days = Math.floor((now.getTime() - t) / 86400000);
  if (days < 0) { const f = -days; return f <= 1 ? "amanhã" : `em ${f} dias`; }
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  if (days < 365) { const m = Math.floor(days / 30); return `há ${m} ${m === 1 ? "mês" : "meses"}`; }
  const y = Math.floor(days / 365); return `há ${y} ${y === 1 ? "ano" : "anos"}`;
}

const DETAIL = {
  pedido: { aguardando_pagamento: "aguardando pagamento", confirmado: "pago, esperando início", em_andamento: "em andamento", concluido: "concluído", cancelado: "cancelado", expirado: "expirado", reembolso_pendente: "reembolso pendente", reembolsado: "reembolsado" },
  reserva: { aguardando_pagamento: "aguardando pagamento", confirmada: "confirmada", expirada: "expirada", cancelada: "cancelada", reembolso_pendente: "reembolso pendente", reembolsada: "reembolsada" },
  reembolso: { pendente: "esperando decisão", aprovado: "aprovado", recusado: "recusado", reembolsado: "devolvido", cancelado: "cancelado" },
  membro_saiu: { casa: "a casa retirou", membro: "a própria pessoa saiu" },
};
/** Texto do detalhe de um evento, em português; desconhecido vira vazio. */
export function eventDetailText(kind, detail) {
  const m = DETAIL[kind];
  return m && typeof detail === "string" && detail in m ? m[detail] : "";
}

/** Onde a casa continua a conversa a partir de um evento (rotas que existem no app). */
export function eventTarget(kind, role) {
  const staff = role === "equipe";
  if (["conversa", "mensagem", "assistente_passada_para_casa", "assistente_assumida", "assistente_devolvida", "pedido", "pedido_concluido", "reserva"].includes(kind)) return staff ? "/atendimento" : "/mensagens";
  if (kind === "membro" || kind === "membro_saiu" || kind === "mensalidade") return "/mensalidades";
  return null;
}
