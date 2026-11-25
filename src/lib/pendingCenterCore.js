// Central de pendências da administração: lê e valida o que vem do banco antes de mostrar (o banco é a fonte de verdade).
export const KIND_LABELS = {
  suporte: "Chamado de suporte",
  moderacao: "Moderação",
  denuncia_chat: "Denúncia de conversa",
  avaliacao_denunciada: "Avaliação contestada",
  exclusao_conta: "Exclusão de conta",
  reembolso_cliente: "Reembolso de cliente",
  reembolso_plataforma: "Reembolso da plataforma",
  cobranca_travada: "Cobrança sem confirmação",
  pedido_reembolso: "Pedido preso em reembolso",
};
export const PRIORITY_LABELS = { urgente: "Urgente", alta: "Alta", normal: "Normal" };
// Onde a administração resolve cada tipo: módulo do painel (?s=), tela (?c=) e o nome do destino.
export const TAB_TARGET = {
  suporte: { section: "suporte", screen: "suporte", label: "Suporte" },
  moderacao: { section: "moderacao", screen: "moderacao", label: "Moderação › Conteúdos denunciados" },
  denuncias: { section: "moderacao", screen: "denuncias-chat", label: "Moderação › Denúncias do chat" },
  avaliacoes: { section: "moderacao", screen: "avaliacoes", label: "Moderação › Avaliações contestadas" },
  financeiro: { section: "reembolsos", screen: "reembolsos", label: "Reembolsos" },
  cobranca: { section: "dinheiro", screen: "cobranca", label: "Dinheiro › Cobrança" },
};
const PRIORITIES = ["urgente", "alta", "normal"];
const str = (v) => (typeof v === "string" ? v : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Aceita só o formato esperado; qualquer linha malformada é descartada em vez de quebrar a tela. */
export function readPending(raw) {
  const empty = { total: 0, overdue: 0, shown: 0, counts: {}, items: [], generatedAt: null };
  if (!raw || typeof raw !== "object") return empty;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i) => i && typeof i === "object" && typeof i.kind === "string" && typeof i.ref_id === "string" && i.kind in KIND_LABELS)
    .map((i) => ({
      kind: i.kind,
      refId: i.ref_id,
      houseId: typeof i.house_id === "string" ? i.house_id : null,
      houseName: typeof i.house_name === "string" ? i.house_name : null,
      title: str(i.title) || KIND_LABELS[i.kind],
      detail: str(i.detail),
      priority: PRIORITIES.includes(i.priority) ? i.priority : "normal",
      dueAt: typeof i.due_at === "string" ? i.due_at : null,
      overdue: i.overdue === true,
      since: typeof i.since === "string" ? i.since : null,
      tab: i.tab in TAB_TARGET ? i.tab : null,
    }));
  const counts = {};
  if (raw.counts && typeof raw.counts === "object") for (const [k, v] of Object.entries(raw.counts)) if (k in KIND_LABELS) counts[k] = num(v);
  return { total: num(raw.total), overdue: num(raw.overdue), shown: items.length, counts, items, generatedAt: typeof raw.generated_at === "string" ? raw.generated_at : null };
}

/** "venceu há 3 h", "vence em 2 d" ou "sem prazo". `now` em ms (testável). */
export function dueText(dueAt, now = Date.now()) {
  if (!dueAt) return "sem prazo";
  const t = Date.parse(dueAt);
  if (!Number.isFinite(t)) return "sem prazo";
  const diff = t - now;
  const abs = Math.abs(diff);
  const min = Math.floor(abs / 60000);
  const span = min < 60 ? `${Math.max(min, 1)} min` : min < 60 * 48 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d`;
  return diff < 0 ? `venceu há ${span}` : `vence em ${span}`;
}

/** Filtros: tipo (ou "todos"), só vencidos e prioridade. */
export function filterPending(items, { kind = "todos", onlyOverdue = false, priority = "todas" } = {}) {
  return items.filter((i) => (kind === "todos" || i.kind === kind) && (!onlyOverdue || i.overdue) && (priority === "todas" || i.priority === priority));
}
