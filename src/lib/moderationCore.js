// Regras puras e textos da moderação (fase 2), sem rede, testáveis em Node. Textos conforme orientação do advogado (15/11/2026).

export const WARNING_HOURS = 72;
export const OLD_CONTENT_DAYS = 15;
export const CONTEST_DAYS = 7;
export const ADAPTATION_DAYS = 30;

export const TARGET_LABEL = { services: "Serviço", events: "Ritual", posts: "Publicação" };
export const REASON_LABEL = { promessa: "Promessa de resultado garantido", contato_antigo: "Contato externo em conteúdo antigo" };
export const STATUS_LABEL = {
  pendente: "Aguardando análise",
  orientada: "Orientação enviada",
  advertida: "Advertência enviada",
  ocultada: "Anúncio ocultado",
  contestada: "Contestação em análise",
  encerrada: "Encerrada",
};

/** Dias e horas do prazo de correção conforme o motivo. */
export function deadlineText(reason) {
  return reason === "contato_antigo" ? `${OLD_CONTENT_DAYS} dias` : `${WARNING_HOURS} horas`;
}

/** O período de adaptação (só orientação) ainda vale? Sem data de início, ainda não começou: vale. */
export function inAdaptation(startIso, days = ADAPTATION_DAYS, now = new Date()) {
  if (!startIso) return true;
  const end = new Date(startIso).getTime() + days * 86400000;
  return now.getTime() < end;
}

export function adaptationEnd(startIso, days = ADAPTATION_DAYS) {
  return startIso ? new Date(new Date(startIso).getTime() + days * 86400000) : null;
}

/** Ações que a administração pode fazer em cada estado (a regra final está no banco). */
export function adminActions(row, now = new Date()) {
  const adapt = inAdaptation(row.adaptation_start, row.adaptation_days ?? ADAPTATION_DAYS, now);
  switch (row.status) {
    case "pendente":
    case "orientada": {
      const a = [{ id: "orientar", label: row.status === "orientada" ? "Reenviar orientação" : "Enviar orientação" }];
      if (!adapt || row.reason === "contato_antigo") a.push({ id: "advertir", label: "Enviar advertência", danger: true });
      a.push({ id: "encerrar", label: "Dispensar" });
      return a;
    }
    case "advertida": return [{ id: "ocultar", label: "Ocultar agora", danger: true }, { id: "encerrar", label: "Encerrar" }];
    case "ocultada": return [{ id: "encerrar", label: "Reativar e encerrar" }];
    case "contestada": return [{ id: "encerrar", label: "Aceitar contestação" }, { id: "manter", label: "Manter decisão", danger: true }];
    default: return [];
  }
}

/** Mensagem que a casa lê em /moderacao, por estado (modelos aprovados pelo advogado). */
export function houseMessage(row) {
  const alvo = (TARGET_LABEL[row.target_table] ?? "Conteúdo").toLowerCase();
  const prazo = deadlineText(row.reason);
  if (row.status === "orientada") {
    if (row.reason === "contato_antigo") {
      return [
        "Dica de ajuste no seu conteúdo – Ilê Conecta",
        "Identificamos que um conteúdo seu publicado antes da nova regra ainda traz contato externo (telefone, link ou @ de rede social). No Plano Grátis, o atendimento acontece dentro da plataforma, pelo chat.",
        `Pedimos que você ajuste esse ${alvo} e use o chat da plataforma para atender seus clientes. Contamos com você para manter a plataforma segura para todos.`,
      ];
    }
    return [
      "Dica de ajuste no seu anúncio – Ilê Conecta",
      `Identificamos que o seu ${alvo} traz um trecho que pode soar como promessa ou garantia de resultado. Para proteger a transparência e o respeito religioso da plataforma, não são permitidas promessas de resultado garantido, prazos certos para desfechos da vida pessoal, saúde, reconciliação ou ganhos financeiros.`,
      "Esta é uma orientação educativa. Sugerimos descrever o trabalho pelo que ele é: a natureza espiritual, os fundamentos da casa e o acolhimento oferecido, sem prometer o resultado.",
    ];
  }
  if (row.status === "advertida") {
    return [
      "Notificação de Advertência e Ajuste de Conteúdo – Ilê Conecta",
      row.reason === "contato_antigo"
        ? `Seu ${alvo} contém contato externo, o que não é permitido no Plano Grátis.`
        : `Seu ${alvo} contém promessa ou garantia de resultado, o que não é permitido pelas regras da plataforma.`,
      `Você tem ${prazo} para ajustar o texto. Se o ajuste não for feito no prazo, apenas esse anúncio será ocultado até a correção; o restante da sua casa continua funcionando normalmente.`,
      `Se entender que houve engano, você pode contestar em até ${CONTEST_DAYS} dias corridos, pelo botão abaixo.`,
    ];
  }
  if (row.status === "ocultada") {
    return [
      "Anúncio ocultado até o ajuste",
      `O prazo da advertência terminou e o ${alvo} foi ocultado. Ele volta a aparecer assim que você ajustar o texto. O restante da sua casa não foi afetado.`,
      `Se entender que houve engano, você pode contestar em até ${CONTEST_DAYS} dias corridos da advertência.`,
    ];
  }
  if (row.status === "contestada") {
    return ["Contestação em análise", "Recebemos a sua contestação. A administração vai analisar e responder por aqui. Enquanto isso, o prazo fica suspenso."];
  }
  return [STATUS_LABEL[row.status] ?? "Registro"];
}

/** Há tempo para contestar? (7 dias corridos a partir da advertência, uma única vez) */
export function canContest(row, now = new Date()) {
  if (!["advertida", "ocultada"].includes(row.status) || row.contested_at || !row.warned_at) return false;
  return now.getTime() <= new Date(row.warned_at).getTime() + CONTEST_DAYS * 86400000;
}

/** Texto curto (até 400 caracteres) para o aviso geral que o proprietário envia, apontando para a página completa. */
export const GENERAL_NOTICE_TEXT =
  "Novidades para fortalecer a segurança e a transparência no Ilê Conecta: atendimento dentro da plataforma no Plano Grátis e comunicação ética, sem promessas garantidas. Há um período de adaptação de 30 dias. Leia o aviso completo.";
export const GENERAL_NOTICE_HREF = "/sobre/novidades-seguranca";
