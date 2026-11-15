// Regras puras da proposta de horário pelo chat (sem rede), testáveis em Node.

/** Lê o dia e a hora digitados pela casa como horário de Brasília (UTC-3 fixo desde 2019) e devolve o instante em ISO, ou null. */
export function brasiliaToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  // recusa datas que o JS "corrige" sozinho (ex.: 2026-02-30 vira março)
  const back = new Date(d.getTime() - 3 * 3600000).toISOString();
  return back.slice(0, 10) === date && back.slice(11, 16) === time ? d.toISOString() : null;
}

/** Texto do estado final do cartão para quem recebe. */
export function proposalStatusText(status, viewerIsHouse) {
  switch (status) {
    case "cancelada": return "Proposta cancelada";
    case "expirada": return "Proposta expirada";
    case "indisponivel": return viewerIsHouse ? "Horário não está mais disponível" : "Horário não está mais disponível. A casa foi avisada para propor outro.";
    case "paga": return "Pago e confirmado";
    case "concluida": return "Atendimento concluído";
    default: return "";
  }
}
