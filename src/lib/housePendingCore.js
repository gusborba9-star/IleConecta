// Central de pendências da casa: lê e valida o que vem do banco antes de mostrar (o banco é a fonte de verdade e já filtra por casa e permissão).
export { dueText, filterPending } from "./pendingCenterCore.js";

export const HOUSE_KIND_LABELS = {
  conversa_sem_resposta: "Conversa sem resposta",
  assunto_da_assistente: "Assunto passado pela assistente",
  pedido_para_iniciar: "Pedido para iniciar",
  atendimento_passou: "Atendimento passou do horário",
  mensalidade_vencida: "Mensalidade vencida",
  reembolso_da_casa: "Reembolso esperando você",
  avaliacao_sem_resposta: "Avaliação sem resposta",
  moderacao: "Ajuste pedido pela moderação",
  suporte: "Chamado esperando você",
  fatura: "Fatura da plataforma",
  cadastro_cpf_cnpj: "Cadastro: CPF ou CNPJ",
  conta_de_recebimento: "Conta de recebimento",
  cartao_vencendo: "Cartão salvo",
  assistente_sem_respostas: "Respostas da assistente",
};
export const HOUSE_PRIORITY_LABELS = { alta: "Alta", normal: "Normal" };
/** Onde a casa resolve cada tipo. A equipe usa a tela de atendimento; a titular, as telas próprias. */
export function houseTarget(tab, role) {
  const staff = role === "equipe";
  switch (tab) {
    case "atendimento": return { path: staff ? "/atendimento" : "/mensagens", label: "Conversas" };
    case "pedidos": return { path: staff ? "/atendimento" : "/pedidos", label: staff ? "Atendimento" : "Pedidos" };
    case "mensalidades": return { path: staff ? "/atendimento?aba=members" : "/painel/membros", label: "Membros" }; // mensalidades dos membros da casa (não a tela do cliente)
    case "moderacao": return { path: "/moderacao", label: "Moderação" };
    case "suporte": return { path: "/suporte/chamados", label: "Meus chamados" };
    case "cobranca": return { path: "/planos?aba=cobrancas", label: "Planos e faturas" };
    case "cadastro": return { path: "/planos?aba=cobrancas", label: "Planos e cadastro" };
    case "assistente": return { path: "/planos", label: "Créditos da assistente" };
    case "avaliacoes": return { path: null, label: "Página da casa" }; // resolvido com o id da casa na tela
    default: return null;
  }
}
/** A página da casa é aberta pelo id da conta da titular (não pelo id interno da casa). Equipe não responde avaliações: sem link. */
export function houseReviewsPath(role, ownerUserId) {
  return role !== "equipe" && typeof ownerUserId === "string" && ownerUserId.length > 0 ? `/casa/${encodeURIComponent(ownerUserId)}?aba=avaliacoes` : null;
}
/**
 * Destino exato de cada pendência. `ownerUserId` é o id da CONTA da titular (a página da casa e o app inteiro usam esse id, não o id interno da casa).
 * Equipe nunca vai para telas da titular (página da casa, início, planos): só para o atendimento.
 */
export function houseDestination(item, role, ownerUserId) {
  if (!item || typeof item !== "object") return null;
  const staff = role === "equipe";
  const me = typeof ownerUserId === "string" && ownerUserId.length > 0 ? encodeURIComponent(ownerUserId) : null;
  switch (item.kind) {
    case "conversa_sem_resposta":
    case "assunto_da_assistente":
      if (staff) return { path: typeof item.refId === "string" && UUID.test(item.refId) ? `/atendimento?aba=chat&conversa=${item.refId}` : "/atendimento?aba=chat", label: "Conversa" };
      // /mensagens/:id usa o id da PESSOA da conversa (não o da conversa); sem ele, abre a lista
      return typeof item.personId === "string" && UUID.test(item.personId) ? { path: `/mensagens/${item.personId}`, label: "Conversa" } : { path: "/mensagens", label: "Conversas" };
    case "pedido_para_iniciar":
    case "atendimento_passou":
      return staff ? { path: "/atendimento?aba=orders", label: "Pedidos" } : me ? { path: "/pedidos", label: "Pedidos da casa" } : null;
    case "reembolso_da_casa":
      return staff || !me ? null : { path: "/pedidos", label: "Reembolsos da casa" };
    case "avaliacao_sem_resposta":
      return staff || !me ? null : { path: `/casa/${me}?aba=avaliacoes`, label: "Avaliações" };
    case "fatura":
      return staff ? null : { path: typeof item.refId === "string" && UUID.test(item.refId) ? `/planos?foco=${item.refId}` : "/planos?aba=cobrancas", label: "Fatura" };
    case "conta_de_recebimento":
      return staff ? null : { path: "/recebimentos?foco=recebimento", label: "Conta de recebimento" };
    default: {
      const t = houseTarget(item.tab, role);
      return t && t.path ? t : null;
    }
  }
}
const PRIORITIES = ["alta", "normal"];
const TABS = ["atendimento", "pedidos", "mensalidades", "moderacao", "suporte", "cobranca", "cadastro", "assistente", "avaliacoes"];
const str = (v) => (typeof v === "string" ? v : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const int = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

function readToPay(raw) {
  if (!raw || typeof raw !== "object") return null;
  const charges = (Array.isArray(raw.charges) ? raw.charges : [])
    .filter((c) => c && typeof c === "object" && typeof c.id === "string" && DAY.test(String(c.due_date)) && Number.isInteger(c.amount_cents) && c.amount_cents >= 0)
    .map((c) => ({
      id: c.id, kind: str(c.kind), description: str(c.description) || "Fatura da plataforma", amountCents: c.amount_cents, dueDate: c.due_date, status: str(c.status),
      // desconto nunca pode ser maior que a fatura nem negativo
      pixDiscountCents: Number.isInteger(c.pix_discount_cents) && c.pix_discount_cents > 0 && c.pix_discount_cents < c.amount_cents ? c.pix_discount_cents : 0,
      overdue: c.overdue === true,
    }));
  return { totalCents: charges.reduce((a, c) => a + c.amountCents, 0), count: charges.length, charges };
}

/** Aceita só o formato esperado; linha malformada é descartada em vez de quebrar a tela. */
export function readHousePending(raw) {
  const empty = { houseId: null, houseName: null, role: "titular", total: 0, overdue: 0, shown: 0, counts: {}, items: [], toPay: null };
  if (!raw || typeof raw !== "object") return empty;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i) => i && typeof i === "object" && typeof i.kind === "string" && i.kind in HOUSE_KIND_LABELS && typeof i.ref_id === "string" && UUID.test(i.ref_id))
    .map((i) => ({
      kind: i.kind, refId: i.ref_id, title: str(i.title) || HOUSE_KIND_LABELS[i.kind], detail: str(i.detail),
      priority: PRIORITIES.includes(i.priority) ? i.priority : "normal",
      dueAt: typeof i.due_at === "string" ? i.due_at : null, overdue: i.overdue === true, since: typeof i.since === "string" ? i.since : null,
      tab: TABS.includes(i.tab) ? i.tab : null,
      personId: typeof i.person_id === "string" && UUID.test(i.person_id) ? i.person_id : null,
    }));
  const counts = {};
  if (raw.counts && typeof raw.counts === "object") for (const [k, v] of Object.entries(raw.counts)) if (k in HOUSE_KIND_LABELS) counts[k] = int(v);
  return {
    houseId: typeof raw.house_id === "string" ? raw.house_id : null, houseName: typeof raw.house_name === "string" ? raw.house_name : null,
    role: raw.role === "equipe" ? "equipe" : "titular", total: int(raw.total), overdue: int(raw.overdue), shown: items.length, counts, items, toPay: readToPay(raw.to_pay),
  };
}
