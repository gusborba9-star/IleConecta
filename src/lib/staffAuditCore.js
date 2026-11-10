// Núcleo puro (sem rede) do histórico de auditoria da equipe: rótulos e frases em português. Testado em tests/staff-audit.test.mjs.

export const PERM_LABEL = {
  chat_read: "ver conversas", chat_reply: "responder conversas", orders: "ver pedidos", post: "publicar na comunidade",
  calendar: "agenda", members: "ver membros", stats: "ver números da divulgação",
};

const permList = (v) => (Array.isArray(v) && v.length ? v.map((k) => PERM_LABEL[k] ?? String(k)).join(", ") : "nenhuma ferramenta");
const ROLE = { dono: "Você", equipe: "A própria pessoa", admin: "A administração", sistema: "O sistema", outro: "Alguém" };

/** Quem agiu, em palavras. Para o dono lendo o próprio histórico, "dono" vira "Você". */
export function actorLabel(role) {
  return ROLE[role] ?? "Alguém";
}

/** Frase curta do que aconteceu. Nunca inclui token de convite nem conteúdo de conversa (a tabela nem guarda). */
export function describeStaffEvent(e) {
  const who = e.targetName ? `“${e.targetName}”` : "a pessoa";
  const d = e.details && typeof e.details === "object" ? e.details : {};
  switch (e.action) {
    case "convite_criado": return `Convite criado para ${who} (${permList(d.perms)}).`;
    case "convite_cancelado": return `Convite de ${who} cancelado.`;
    case "aceito": return `${who} aceitou o convite e entrou na equipe (${permList(d.perms)}).`;
    case "pausado": return `Acesso de ${who} pausado.`;
    case "reativado": return `Acesso de ${who} reativado.`;
    case "removido": return `${who} foi removido(a) da equipe.`;
    case "permissoes_alteradas": return `Permissões de ${who} alteradas: antes ${permList(d.antes)}; agora ${permList(d.depois)}.`;
    case "nome_alterado": return `Nome alterado de “${d.antes ?? "?"}” para “${d.depois ?? "?"}”.`;
    case "admin_consultou": return `A administração consultou este histórico${d.motivo ? ` — motivo: ${d.motivo}` : ""}.`;
    default: return "Evento registrado.";
  }
}

/** Valida o motivo da consulta da administração (mesma regra do banco: 5 a 300 caracteres úteis). */
export function validateAuditReason(text) {
  const t = String(text ?? "").trim();
  if (t.length < 5) return "Informe o motivo da consulta (mínimo de 5 caracteres).";
  if (t.length > 300) return "O motivo pode ter no máximo 300 caracteres.";
  return null;
}

/** Converte a linha do banco no formato usado pelas telas. */
export function toAuditEvent(r) {
  return {
    id: Number(r.id), houseId: String(r.house_id), action: String(r.action), actorRole: String(r.actor_role),
    targetName: r.target_name ?? null, details: r.details ?? {}, createdAt: String(r.created_at),
  };
}
