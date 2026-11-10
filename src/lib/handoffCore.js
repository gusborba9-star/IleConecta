// Regras de exibição do estado do atendimento (0071). Sem rede: testado em tests/handoff-core.test.mjs.

/** Converte a linha devolvida por conversation_handoff_state. Valor desconhecido vira "automacao" (nunca inventa atendimento humano). */
export function toHandoff(row) {
  const r = row && typeof row === "object" ? row : {};
  const state = r.state === "pendente" || r.state === "humano" ? r.state : "automacao";
  const active = state !== "automacao" && r.active === true;
  return { state: active ? state : "automacao", active, handlerName: typeof r.handler_name === "string" && r.handler_name.trim() ? r.handler_name.trim() : null };
}

/**
 * O que mostrar na conversa. viewer: "house" (dono ou equipe) ou "client".
 * Devolve null quando não há nada a dizer (a assistente atende normalmente).
 */
export function handoffView(h, viewer) {
  if (!h || !h.active) return null;
  if (viewer === "house") {
    if (h.state === "pendente") return { tone: "alert", text: "A assistente passou esta conversa para a casa. Responda ou assuma para ela não falar por cima.", action: "take" };
    return { tone: "info", text: h.handlerName ? `${h.handlerName} está atendendo. A assistente está em pausa nesta conversa.` : "A casa está atendendo. A assistente está em pausa nesta conversa.", action: "release" };
  }
  if (h.state === "pendente") return { tone: "info", text: "A casa foi avisada e vai responder por aqui.", action: null };
  return { tone: "info", text: "A casa está atendendo esta conversa.", action: null };
}

/** A assistente deve ser chamada pelo app? Com humano atendendo não (o servidor também recusa; isto só poupa uma ida à rede). */
export function shouldCallAssistant({ houseOffline, hasAssistant, handoff }) {
  return Boolean(houseOffline && hasAssistant && !(handoff && handoff.active));
}
