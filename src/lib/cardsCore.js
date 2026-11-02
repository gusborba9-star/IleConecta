// Regras puras dos cards da casa (ritual, jogo, serviço, trabalho): segmento, cores, textos e horários.
// Sem rede, testável em Node. O visual fica em src/components/OfferCard.tsx.

/** Tonalidade de cada segmento (fundo suave, borda, cor de destaque com contraste AA sobre branco). */
export const SEGMENTS = {
  ritual: { label: "Ritual coletivo", bg: "#FBF2DE", border: "rgba(170,120,30,.28)", accent: "#8A520C", glow: "rgba(170,120,30,.45)" },
  jogo: { label: "Jogo", bg: "#E8F1EA", border: "rgba(31,91,67,.25)", accent: "#1F5B43", glow: "rgba(31,91,67,.45)" },
  servico: { label: "Serviço", bg: "#FBE9E1", border: "rgba(179,58,24,.22)", accent: "#B33A18", glow: "rgba(179,58,24,.4)" },
  trabalho: { label: "Trabalho", bg: "#EEE9F5", border: "rgba(91,63,122,.25)", accent: "#5B3F7A", glow: "rgba(91,63,122,.45)" },
};

/** Serviço com agenda é "jogo"; trabalho e limpeza são "trabalho"; o resto é "serviço". */
export function serviceSegment(s) {
  if (s?.bookable) return "jogo";
  if (s?.kind === "trabalho" || s?.kind === "limpeza") return "trabalho";
  return "servico";
}

const pad = (n) => String(n).padStart(2, "0");
const brt = (iso) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000);

/** "19h30" / "10h" no horário de Brasília. */
export function timeLabel(iso) {
  const d = brt(iso);
  return d.getUTCMinutes() === 0 ? `${d.getUTCHours()}h` : `${d.getUTCHours()}h${pad(d.getUTCMinutes())}`;
}

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const dayN = (d) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);

/** "Hoje 19h30", "Amanhã 10h", "Qua 15h". */
export function slotChipLabel(iso, now = new Date()) {
  const diff = dayN(brt(iso)) - dayN(brt(now.toISOString()));
  const d = brt(iso);
  const day = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : WEEK[d.getUTCDay()];
  return `${day} ${timeLabel(iso)}`;
}

/** Bloco de data do ritual: { month: "NOV", day: "14", when: "Sábado, às 19h" } no horário de Brasília. */
export function dateTile(iso) {
  const d = brt(iso);
  return { month: MONTH[d.getUTCMonth()], day: pad(d.getUTCDate()), when: `${WEEK_LONG[d.getUTCDay()]}, às ${timeLabel(iso)}` };
}

/** Texto do botão principal; no jogo com horário escolhido: "Agendar 19h30". */
export function primaryLabel(segment, slotIso) {
  if (segment === "ritual") return "Participar";
  if (segment === "jogo") return slotIso ? `Agendar ${timeLabel(slotIso)}` : "Agendar horário";
  return "Contratar";
}

/** Frase curta abaixo do botão: o que o cliente pode fazer, sem manual. Só fala de pagamento quando ele existe. */
export function cardHint(segment, payOn, noButton = false) {
  if (noButton) return "Combine o horário e o pagamento direto com a casa pela conversa.";
  if (segment === "ritual") return payOn ? "Clique em participar, faça o pagamento e sua vaga é confirmada." : "Clique em participar para reservar sua vaga; o pagamento é combinado com a casa.";
  if (segment === "jogo") return payOn ? "Escolha o dia e o horário, faça o pagamento e sua consulta é agendada automaticamente." : "Escolha o dia e o horário para agendar; o pagamento é combinado com a casa.";
  return payOn ? "Contrate pelo app, acompanhe cada etapa e receba o aviso quando a casa iniciar e concluir." : "Faça o pedido pelo app e acompanhe; o pagamento é combinado com a casa.";
}

/** Quem atende no link "Conversar": casa online → casa; offline com assistente → assistente; senão a casa responde ao voltar. */
export function chatStatus({ online, hasAssistant }) {
  if (online) return "a casa está online";
  return hasAssistant ? "a assistente atende agora" : "a casa responde quando voltar";
}

/** Mensagem após o pagamento (tela e chat): a mesma em todos os lugares. */
export const AFTER_PAYMENT = "Assim que o pagamento for confirmado, você recebe a confirmação aqui. Fique atento às suas notificações.";
