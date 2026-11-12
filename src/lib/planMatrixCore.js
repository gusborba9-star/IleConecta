// Matriz central de planos (Blueprint §18.1): limites, ferramentas e textos de cada plano em um só lugar.
// A fonte da verdade é platform_settings.plan_matrix (editável no painel admin). Aqui ficam os valores iniciais
// (idênticos aos que já valiam antes da matriz), a validação e o texto com números calculados. Puro e testável.
// Os mesmos valores iniciais existem em plan_matrix_default() no banco; tests/plan-matrix.test.mjs garante que não divergem.
const PLAN_IDS = ["base", "intermediario", "maximo"];
const COPY_FEATURES = ["assistant", "boost", "highlight", "payments", "ritual_video", "referral", "reviews", "calendar"];

/** Limites numéricos por plano: [mínimo, máximo, rótulo no painel]. */
export const CAP_NUMBERS = {
  assistant_replies: [0, 100000, "Respostas da assistente por mês"],
  campaign_links: [0, 200, "Links de divulgação"],
  campaign_card_styles: [0, 10, "Estilos de cartão para postar"],
  quick_replies: [0, 200, "Respostas rápidas"],
  included_seats: [0, 20, "Acessos de equipe inclusos"],
};
/** Ferramentas liga/desliga por plano: rótulo no painel. */
export const CAP_FLAGS = {
  assistant_sells: "Assistente vende pela plataforma",
  assistant_discount: "Assistente pode dar desconto (se a casa liberar)",
  chat_media: "Fotos e vídeos no chat",
  members_area: "Área de membros e mensalidades",
  calendar_full: "Calendário completo (repetição anual e público seguidores)",
  campaign_daily_count: "Contagem dia a dia dos links de divulgação",
  campaign_insights_full: "Todos os assuntos e serviços mais procurados",
  ritual_video: "Vídeo de 30 s nos registros do ritual",
};
export const CAP_NUMBER_KEYS = Object.keys(CAP_NUMBERS);
export const CAP_FLAG_KEYS = Object.keys(CAP_FLAGS);

export const DEFAULT_PLAN_MATRIX = {
  caps: {
    base: { assistant_replies: 0, campaign_links: 0, campaign_card_styles: 0, quick_replies: 0, included_seats: 0, assistant_sells: false, assistant_discount: false, chat_media: false, members_area: false, calendar_full: false, campaign_daily_count: false, campaign_insights_full: false, ritual_video: false },
    intermediario: { assistant_replies: 300, campaign_links: 2, campaign_card_styles: 1, quick_replies: 3, included_seats: 0, assistant_sells: true, assistant_discount: false, chat_media: false, members_area: false, calendar_full: false, campaign_daily_count: false, campaign_insights_full: false, ritual_video: false },
    maximo: { assistant_replies: 3000, campaign_links: 30, campaign_card_styles: 3, quick_replies: 50, included_seats: 1, assistant_sells: true, assistant_discount: true, chat_media: true, members_area: true, calendar_full: true, campaign_daily_count: true, campaign_insights_full: true, ritual_video: true },
  },
  // {assistant_replies}, {campaign_links}, {quick_replies} e {included_seats} viram o número do plano na hora de mostrar.
  // "feature" esconde o item até o interruptor do painel ser ligado (aparece sozinho, como novidade).
  copy: {
    base: {
      tagline: "Tudo para a sua casa receber pessoas.",
      benefits: [
        { text: "Página completa da casa, com foto de perfil, capa e informações", feature: null },
        { text: "Rituais, jogos e serviços com pagamento pela plataforma", feature: null },
        { text: "Publicações no feed e avaliações dos clientes", feature: null },
        { text: "Chat com texto e PDF", feature: null },
        { text: "Datas públicas na agenda da casa", feature: null },
      ],
    },
    intermediario: {
      tagline: "A casa atendendo a qualquer hora.",
      benefits: [
        { text: "Tudo do Essencial", feature: null },
        { text: "Lara, a assistente da casa, atende 24h (até {assistant_replies} respostas por mês) e informa as datas da agenda", feature: null },
        { text: "Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes", feature: null },
        { text: "Passa para você os assuntos delicados, com aviso no sino", feature: null },
        { text: "Catálogo interno e relatório do atendimento", feature: null },
        { text: "Até {campaign_links} links de divulgação, com QR code e modo discreto", feature: null },
        { text: "Até {quick_replies} respostas rápidas para o chat", feature: null },
      ],
    },
    maximo: {
      tagline: "A casa completa, com a comunidade por perto.",
      benefits: [
        { text: "Tudo do Profissional", feature: null },
        { text: "Lara com até {assistant_replies} respostas por mês e descontos definidos pela casa", feature: null },
        { text: "Área de membros e mensalidades, sem planilha", feature: null },
        { text: "Calendário completo: cada data para o público certo e repetição anual", feature: null },
        { text: "Fotos e vídeos curtos no chat com os clientes", feature: null },
        { text: "Até {campaign_links} links de divulgação, com contagem dia a dia", feature: null },
        { text: "Até {quick_replies} respostas rápidas para o chat", feature: null },
        { text: "{included_seats} acesso de equipe incluso, para quem ajuda a cuidar da casa", feature: null },
        { text: "Vídeo de 30 segundos nos registros dos rituais", feature: "ritual_video" },
      ],
    },
  },
};

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = (x) => JSON.parse(JSON.stringify(x));

function sanitizeCopy(raw, d) {
  const r = isRecord(raw) ? raw : {};
  const tagline = typeof r.tagline === "string" && r.tagline.trim() ? r.tagline.trim().slice(0, 120) : d.tagline;
  let benefits = d.benefits;
  if (Array.isArray(r.benefits)) {
    const list = r.benefits
      .filter((b) => isRecord(b) && typeof b.text === "string" && b.text.trim())
      .slice(0, 12)
      .map((b) => ({ text: b.text.trim().slice(0, 200), feature: COPY_FEATURES.includes(b.feature) ? b.feature : null }));
    if (list.length > 0 || r.benefits.length === 0) benefits = list;
  }
  return { tagline, benefits };
}

/** Aceita qualquer coisa vinda do banco e devolve uma matriz sempre válida (campo inválido volta ao valor inicial). */
export function sanitizePlanMatrix(raw) {
  const r = isRecord(raw) ? raw : {};
  const caps = {}, copy = {};
  for (const id of PLAN_IDS) {
    const d = DEFAULT_PLAN_MATRIX.caps[id], x = isRecord(r.caps) && isRecord(r.caps[id]) ? r.caps[id] : {};
    caps[id] = {};
    for (const [k, [min, max]] of Object.entries(CAP_NUMBERS)) caps[id][k] = typeof x[k] === "number" && Number.isInteger(x[k]) && x[k] >= min && x[k] <= max ? x[k] : d[k];
    for (const k of CAP_FLAG_KEYS) caps[id][k] = typeof x[k] === "boolean" ? x[k] : d[k];
    copy[id] = sanitizeCopy(isRecord(r.copy) ? r.copy[id] : undefined, DEFAULT_PLAN_MATRIX.copy[id]);
  }
  return { caps, copy };
}

/** Valor de uma capacidade do plano. Plano ou chave desconhecidos valem como o plano Essencial (o mais restrito). */
export function planCap(matrix, plan, key) {
  const m = matrix?.caps ?? DEFAULT_PLAN_MATRIX.caps;
  const row = m[PLAN_IDS.includes(plan) ? plan : "base"] ?? DEFAULT_PLAN_MATRIX.caps.base;
  return Object.hasOwn(row, key) ? row[key] : DEFAULT_PLAN_MATRIX.caps.base[key];
}

/** Troca {chave} pelo número do plano. Chave desconhecida some (nunca aparece "{...}" na tela). */
export function renderBenefit(text, caps) {
  return String(text).replace(/\{([a-z_]+)\}/g, (_, k) => (Object.hasOwn(CAP_NUMBERS, k) && caps && Object.hasOwn(caps, k) ? Number(caps[k]).toLocaleString("pt-BR") : ""));
}

/** Itens de um plano prontos para a tela. Item ligado a uma ferramenta só aparece com o interruptor ligado ("isOn" decide). */
export function benefitsFor(matrix, plan, isOn) {
  const copy = matrix?.copy?.[plan] ?? DEFAULT_PLAN_MATRIX.copy[plan] ?? DEFAULT_PLAN_MATRIX.copy.base;
  const caps = matrix?.caps?.[plan] ?? DEFAULT_PLAN_MATRIX.caps.base;
  // Item que cita um número zerado no plano ("Até 0 links") não aparece: o plano simplesmente não tem aquilo.
  const zeroed = (text) => [...String(text).matchAll(/\{([a-z_]+)\}/g)].some(([, k]) => Object.hasOwn(CAP_NUMBERS, k) && Number(caps[k]) === 0);
  return copy.benefits
    .filter((b) => (!b.feature || isOn(b.feature)) && !zeroed(b.text))
    .map((b) => ({ text: renderBenefit(b.text, caps), isNew: Boolean(b.feature) }));
}

export const cloneDefaultMatrix = () => clone(DEFAULT_PLAN_MATRIX);
