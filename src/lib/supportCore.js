// Regras puras do suporte (sem rede): tipos de ocorrência, rótulos, validação e prazos. Espelha a tabela do banco (support_kind_meta).

export const KINDS = [
  { id: "risco_vida", label: "Risco à vida ou à integridade", group: "Segurança", priority: "urgente", help: "Alguém em perigo agora. Atendimento imediato." },
  { id: "golpe_fraude", label: "Golpe ou fraude", group: "Segurança", priority: "alta", help: "Cobrança indevida, falsa promessa, pedido de dinheiro por fora." },
  { id: "abuso", label: "Abuso ou assédio", group: "Segurança", priority: "alta", help: "Ofensas, ameaças, importunação." },
  { id: "conteudo_improprio", label: "Conteúdo impróprio", group: "Segurança", priority: "alta", help: "Publicação, foto ou mensagem que fere as normas." },
  { id: "informacao_falsa", label: "Informação falsa", group: "Segurança", priority: "alta", help: "Perfil, serviço ou ritual que engana." },
  { id: "pagamento", label: "Problema com pagamento", group: "Dinheiro", priority: "alta", help: "Cobrança duplicada, pagamento não reconhecido." },
  { id: "reembolso", label: "Reembolso", group: "Dinheiro", priority: "alta", help: "Pedir ou contestar um reembolso." },
  { id: "pedido_reserva", label: "Pedido ou reserva", group: "Dinheiro", priority: "alta", help: "Atendimento não realizado, reserva errada." },
  { id: "disputa", label: "Conflito com outra pessoa", group: "Dinheiro", priority: "alta", help: "Desacordo que precisa de decisão da plataforma." },
  { id: "conta_acesso", label: "Acesso à conta", group: "Conta e dados", priority: "alta", help: "Não consigo entrar, e-mail errado, conta suspensa." },
  { id: "lgpd_dados", label: "Meus dados (LGPD)", group: "Conta e dados", priority: "alta", help: "Ver, corrigir ou exportar os meus dados." },
  { id: "exclusao_dados", label: "Apagar meus dados", group: "Conta e dados", priority: "alta", help: "Pedir exclusão de dados específicos." },
  { id: "exclusao_conta", label: "Excluir minha conta", group: "Conta e dados", priority: "alta", help: "Encerrar a conta e anonimizar os dados." },
  { id: "duvida", label: "Dúvida", group: "Outros", priority: "normal", help: "Como algo funciona." },
  { id: "sugestao", label: "Sugestão", group: "Outros", priority: "normal", help: "Uma ideia para melhorar a plataforma." },
  { id: "tecnico", label: "Problema técnico", group: "Outros", priority: "normal", help: "Algo quebrou ou não carrega." },
];

export const PRIORITY_LABEL = { urgente: "Urgente · imediata", alta: "Alta · até 24 h", normal: "Normal · até 3 dias úteis" };
export const PRIORITY_LABEL_LGPD = "Alta · até 15 dias";
export const LGPD_KINDS = ["lgpd_dados", "exclusao_dados", "exclusao_conta"];

export const STATUS_LABEL = {
  aberto: "Aberto", em_analise: "Em análise", aguardando_pessoa: "Aguardando você", aguardando_envolvido: "Aguardando a outra parte",
  resolvido: "Resolvido", recusado: "Encerrado sem ação",
};
export const DECISION_LABEL = { procedente: "Procedente", improcedente: "Improcedente", parcial: "Parcialmente procedente", sem_acao: "Sem ação necessária", orientacao: "Orientação" };

export const isClosed = (status) => status === "resolvido" || status === "recusado";
export const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label ?? id;
export const priorityText = (kind, priority) => (LGPD_KINDS.includes(kind) ? PRIORITY_LABEL_LGPD : PRIORITY_LABEL[priority] ?? priority);

export const TITLE_MIN = 3, TITLE_MAX = 120, DESC_MIN = 10, DESC_MAX = 2000;

/** Valida o formulário "Relatar ocorrência". Devolve a mensagem de erro ou null. */
export function validateReport({ kind, title, description, consent }) {
  if (!KINDS.some((k) => k.id === kind)) return "Escolha o tipo de ocorrência.";
  const t = String(title ?? "").trim(), d = String(description ?? "").trim();
  if (t.length < TITLE_MIN || t.length > TITLE_MAX) return `Dê um título (${TITLE_MIN} a ${TITLE_MAX} letras).`;
  if (d.length < DESC_MIN) return `Conte o que aconteceu (pelo menos ${DESC_MIN} letras).`;
  if (d.length > DESC_MAX) return `A descrição passou de ${DESC_MAX} letras.`;
  if (consent !== true) return "Confirme que entendeu quais informações a equipe poderá ver.";
  return null;
}

/** Ordem da fila do administrador: urgente, alta, normal; dentro disso, o prazo mais próximo primeiro. */
export function sortQueue(rows) {
  const rank = { urgente: 0, alta: 1, normal: 2 };
  return [...rows].sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || String(a.first_response_due).localeCompare(String(b.first_response_due)));
}

/** Aviso sobre o que o painel pode ver ao abrir uma ocorrência (mostrado antes de enviar). */
export const CONSENT_TEXT =
  "Entendo que a equipe da plataforma poderá ver os dados reais do caso: o pedido ou a reserva, pagamentos, as últimas 30 mensagens da conversa (inclusive as que foram apagadas) e os aceites dos Termos. Fotos e documentos só são vistos se eu escolher enviá-los.";
export const EVIDENCE_CONSENT_TEXT = "Escolho enviar este arquivo ao suporte. Só a equipe da plataforma poderá vê-lo.";

/** Valida a troca do e-mail de suporte (vazio = remover). */
export function validateSupportEmail(v) {
  const e = String(v ?? "").trim();
  if (e === "") return null;
  return e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? null : "E-mail inválido.";
}
