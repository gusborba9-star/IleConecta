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
 * Para a casa com assistente, a faixa é permanente (always = true): mostra também quando a assistente atende e
 * deixa "Assumir" sempre à mão. Para o cliente só aparece quando há atendimento humano. Textos curtos: a faixa é de uma linha.
 * Devolve null quando não há nada a mostrar.
 */
export function handoffView(h, viewer, { always = false } = {}) {
  if (viewer === "house") {
    if (h && h.active && h.state === "pendente") return { tone: "alert", text: "Aguardando você", action: "take", label: "Assumir" };
    if (h && h.active) return { tone: "info", text: h.handlerName ? `${h.handlerName} atendendo` : "Você está atendendo", action: "release", label: "Devolver à assistente" };
    return always ? { tone: "info", text: "Assistente ativa", action: "take", label: "Assumir" } : null;
  }
  if (!h || !h.active) return null;
  return { tone: "info", text: h.state === "pendente" ? "A casa foi avisada e responde por aqui" : "A casa está atendendo", action: null, label: "" };
}

/** A assistente deve ser chamada pelo app? Com humano atendendo não (o servidor também recusa; isto só poupa uma ida à rede). */
export function shouldCallAssistant({ houseOffline, hasAssistant, handoff }) {
  return Boolean(houseOffline && hasAssistant && !(handoff && handoff.active));
}
