// Indicadores da administração: leitura defensiva do que vem do banco (0133), contas derivadas e textos de definição e origem.
// O banco só entrega para a administração; aqui só se aceita o formato esperado e nunca se inventa número.
export const PERIODS = [7, 30, 90];

/** unit: n | pct | h | brl | tok. better: o que é melhor (para a cor da variação); "none" = só informa. */
export const INDICATORS = {
  novas_contas: { group: "Crescimento", label: "Novas contas", unit: "n", better: "up",
    definition: "Contas criadas no período, de clientes e de casas.", source: "Perfis da plataforma." },
  novas_casas: { group: "Crescimento", label: "Novas casas", unit: "n", better: "up",
    definition: "Casas criadas no período.", source: "Casas da plataforma." },
  conversao_pct: { group: "Crescimento", label: "Casas novas que já pagaram plano", unit: "pct", better: "up",
    definition: "Das casas criadas no período, quantas já têm ao menos uma cobrança de plano paga (conversão do Grátis para o pago).", source: "Casas e cobranças de plano da plataforma." },
  volume_cents: { group: "Negócio das casas", label: "Volume transacionado", unit: "brl", better: "up",
    definition: "Soma bruta dos pagamentos confirmados no período (pedidos, rituais e mensalidades de membros).", source: "Pagamentos das casas." },
  casas_que_venderam: { group: "Negócio das casas", label: "Casas que venderam", unit: "n", better: "up",
    definition: "Casas com ao menos um pagamento confirmado no período.", source: "Pagamentos, pedidos, reservas e mensalidades." },
  pedidos_criados: { group: "Negócio das casas", label: "Pedidos criados", unit: "n", better: "up",
    definition: "Pedidos de serviço abertos no período, pagos ou não.", source: "Pedidos de serviço." },
  reservas_criadas: { group: "Negócio das casas", label: "Reservas criadas", unit: "n", better: "up",
    definition: "Reservas de ritual feitas no período, pagas ou não.", source: "Reservas dos rituais." },
  receita_total_cents: { group: "Receita da plataforma", label: "Receita total", unit: "brl", better: "up",
    definition: "Comissão sobre as vendas das casas somada às assinaturas, divulgação e créditos pagos no período.", source: "Calculado a partir dos quatro números abaixo." },
  comissao_cents: { group: "Receita da plataforma", label: "Comissão", unit: "brl", better: "up",
    definition: "Taxa da plataforma sobre os pagamentos confirmados no período.", source: "Pagamentos das casas." },
  receita_assinatura_cents: { group: "Receita da plataforma", label: "Assinaturas", unit: "brl", better: "up",
    definition: "Planos e vagas extras de equipe pagos pelas casas no período, pelo dia do pagamento.", source: "Cobranças da plataforma." },
  receita_divulgacao_cents: { group: "Receita da plataforma", label: "Divulgação", unit: "brl", better: "up",
    definition: "Destaques e impulsionamentos pagos no período.", source: "Cobranças da plataforma." },
  receita_creditos_cents: { group: "Receita da plataforma", label: "Créditos da assistente", unit: "brl", better: "up",
    definition: "Pacotes de créditos da assistente pagos no período.", source: "Cobranças da plataforma." },
  cobrancas_vencidas: { group: "Receita da plataforma", label: "Cobranças vencidas", unit: "n", better: "down",
    definition: "Cobranças da plataforma que venceram no período e continuam sem pagamento.", source: "Cobranças da plataforma." },
  cobrancas_canceladas: { group: "Receita da plataforma", label: "Cobranças canceladas", unit: "n", better: "down",
    definition: "Cobranças da plataforma canceladas no período.", source: "Cobranças da plataforma." },
  reembolsos_pedidos: { group: "Reembolsos e disputas", label: "Reembolsos pedidos", unit: "n", better: "down",
    definition: "Pedidos de reembolso feitos por clientes no período.", source: "Pedidos de reembolso." },
  reembolsos_feitos: { group: "Reembolsos e disputas", label: "Reembolsos concluídos", unit: "n", better: "none",
    definition: "Dos pedidos feitos no período, quantos já foram devolvidos.", source: "Pedidos de reembolso." },
  pagamentos_estornados: { group: "Reembolsos e disputas", label: "Pagamentos estornados", unit: "n", better: "down",
    definition: "Pagamentos do período estornados, no todo ou em parte.", source: "Pagamentos das casas." },
  reembolsos_plano_cents: { group: "Reembolsos e disputas", label: "Plano devolvido às casas", unit: "brl", better: "down",
    definition: "Valor de planos devolvido às casas no período (reembolso dos primeiros dias).", source: "Reembolsos de plano concluídos." },
  pagamentos_contestados: { group: "Reembolsos e disputas", label: "Pagamentos contestados", unit: "n", better: "down",
    definition: "Pagamentos do período contestados junto ao banco ou à operadora.", source: "Pagamentos das casas." },
  casos_disputa: { group: "Reembolsos e disputas", label: "Casos de disputa", unit: "n", better: "down",
    definition: "Casos de suporte do tipo disputa abertos no período.", source: "Casos de suporte." },
  incidentes: { group: "Reembolsos e disputas", label: "Incidentes graves", unit: "n", better: "down",
    definition: "Casos de risco de vida, golpe ou fraude e abuso abertos no período.", source: "Casos de suporte." },
  casos_abertos: { group: "Atendimento", label: "Casos de suporte abertos", unit: "n", better: "none",
    definition: "Casos abertos no período, de qualquer tipo.", source: "Casos de suporte." },
  casos_resolvidos: { group: "Atendimento", label: "Casos resolvidos", unit: "n", better: "up",
    definition: "Casos que tiveram a solução registrada no período (mesmo abertos antes).", source: "Casos de suporte." },
  primeira_resposta_mediana_h: { group: "Atendimento", label: "Primeira resposta (mediana)", unit: "h", better: "down",
    definition: "Metade dos casos abertos no período recebeu a primeira resposta em menos que este tempo.", source: "Casos de suporte que já tiveram resposta." },
  no_prazo_pct: { group: "Atendimento", label: "Respondidos no prazo", unit: "pct", better: "up",
    definition: "Dos casos abertos no período que já tiveram resposta, quantos foram respondidos dentro do prazo.", source: "Casos de suporte." },
  casos_sem_resposta_no_prazo: { group: "Atendimento", label: "Sem resposta com prazo vencido", unit: "n", better: "down",
    definition: "Casos abertos no período, ainda sem resposta, cujo prazo de primeira resposta já passou.", source: "Casos de suporte." },
  ia_respostas: { group: "IA e uso", label: "Respostas da assistente", unit: "n", better: "none",
    definition: "Respostas geradas pela assistente no período.", source: "Uso da assistente." },
  ia_tokens: { group: "IA e uso", label: "Texto processado pela IA", unit: "tok", better: "none",
    definition: "Entrada mais saída da IA no período, em tokens (é a base do custo).", source: "Uso da assistente." },
  mensagens: { group: "IA e uso", label: "Mensagens enviadas", unit: "n", better: "none",
    definition: "Mensagens de pessoas no período (as da assistente não entram).", source: "Conversas." },
  ativos_7d: { group: "Base de hoje", label: "Ativos nos últimos 7 dias", unit: "n", better: "up", snapshot: true,
    definition: "Pessoas que abriram o app nos últimos 7 dias.", source: "Último acesso dos perfis, no momento. Não há histórico, por isso sem comparação." },
  ativos_30d: { group: "Base de hoje", label: "Ativos nos últimos 30 dias", unit: "n", better: "up", snapshot: true,
    definition: "Pessoas que abriram o app nos últimos 30 dias.", source: "Último acesso dos perfis, no momento." },
  casas_ativas_30d: { group: "Base de hoje", label: "Casas ativas nos últimos 30 dias", unit: "n", better: "up", snapshot: true,
    definition: "Casas cuja titular abriu o app nos últimos 30 dias.", source: "Último acesso das titulares, no momento." },
  usuarios_total: { group: "Base de hoje", label: "Contas no total", unit: "n", better: "up", snapshot: true,
    definition: "Todas as contas da plataforma.", source: "Perfis." },
  casas_total: { group: "Base de hoje", label: "Casas no total", unit: "n", better: "up", snapshot: true,
    definition: "Todas as casas da plataforma.", source: "Casas." },
  casas_pagantes: { group: "Base de hoje", label: "Casas em plano pago", unit: "n", better: "up", snapshot: true,
    definition: "Casas que hoje não estão no plano Grátis.", source: "Plano atual das casas." },
  retencao_pct: { group: "Base de hoje", label: "Retenção de assinantes", unit: "pct", better: "up", snapshot: true,
    definition: "Das casas que pagaram plano entre 60 e 30 dias atrás, quantas pagaram de novo nos últimos 30 dias.", source: "Cobranças de plano pagas. Sempre sobre 30 dias, qualquer que seja o período escolhido." },
  casos_em_aberto: { group: "Base de hoje", label: "Casos ainda em aberto", unit: "n", better: "down", snapshot: true,
    definition: "Casos de suporte que ainda não foram resolvidos nem recusados (de todo o tempo).", source: "Casos de suporte." },
};
export const GROUPS = ["Crescimento", "Negócio das casas", "Receita da plataforma", "Reembolsos e disputas", "Atendimento", "IA e uso", "Base de hoje"];
export const PLAN_LABELS = { gratis: "Grátis", base: "Essencial", intermediario: "Profissional", maximo: "Premium" };

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rawNum = (v) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : num(v));
const nonNeg = (v) => { const n = rawNum(v); return n !== null && n >= 0 ? n : null; };
const pct = (a, b) => (a !== null && b !== null && b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const sum = (...xs) => (xs.some((x) => x === null) ? null : xs.reduce((a, b) => a + b, 0));

function pair(raw, key) {
  const m = raw && typeof raw === "object" && raw.metrics && typeof raw.metrics === "object" ? raw.metrics[key] : null;
  return { current: nonNeg(m?.current), previous: nonNeg(m?.previous) };
}
const RAW_KEYS = ["novas_contas", "novas_casas", "novas_casas_pagantes", "volume_cents", "comissao_cents", "casas_que_venderam", "receita_assinatura_cents", "receita_divulgacao_cents",
  "receita_creditos_cents", "cobrancas_vencidas", "cobrancas_canceladas", "reembolsos_pedidos", "reembolsos_feitos", "pagamentos_estornados", "reembolsos_plano_cents", "pagamentos_contestados",
  "casos_disputa", "incidentes", "casos_abertos", "casos_resolvidos", "casos_com_resposta", "casos_resposta_no_prazo", "casos_sem_resposta_no_prazo", "primeira_resposta_mediana_h",
  "ia_respostas", "ia_tokens_entrada", "ia_tokens_saida", "mensagens", "pedidos_criados", "reservas_criadas"];

/** Lê a resposta do banco e monta todos os indicadores (inclusive os derivados). Sem dado, o valor é null (a tela mostra "—"). */
export function readAdminIndicators(raw) {
  const empty = { days: 30, items: {}, plans: [] };
  if (!raw || typeof raw !== "object") return empty;
  const days = PERIODS.includes(raw.days) ? raw.days : 30;
  const b = {};
  for (const k of RAW_KEYS) b[k] = pair(raw, k);
  const snap = raw.snapshot && typeof raw.snapshot === "object" ? raw.snapshot : {};
  const both = (f) => ({ current: f("current"), previous: f("previous") });
  const items = {};
  for (const k of Object.keys(INDICATORS)) if (b[k]) items[k] = b[k];
  items.conversao_pct = both((w) => pct(b.novas_casas_pagantes[w], b.novas_casas[w]));
  items.receita_total_cents = both((w) => sum(b.comissao_cents[w], b.receita_assinatura_cents[w], b.receita_divulgacao_cents[w], b.receita_creditos_cents[w]));
  items.no_prazo_pct = both((w) => pct(b.casos_resposta_no_prazo[w], b.casos_com_resposta[w]));
  items.ia_tokens = both((w) => sum(b.ia_tokens_entrada[w], b.ia_tokens_saida[w]));
  const plansRaw = snap.casas_por_plano && typeof snap.casas_por_plano === "object" ? snap.casas_por_plano : {};
  const plans = Object.keys(PLAN_LABELS).map((p) => ({ plan: p, label: PLAN_LABELS[p], count: nonNeg(plansRaw[p]) ?? 0 }));
  const paying = plans.filter((p) => p.plan !== "gratis").reduce((a, p) => a + p.count, 0);
  const snapVal = (v) => ({ current: v, previous: null });
  for (const k of ["ativos_7d", "ativos_30d", "casas_ativas_30d", "usuarios_total", "casas_total", "casos_em_aberto"]) items[k] = snapVal(nonNeg(snap[k]));
  items.casas_pagantes = snapVal(snap.casas_por_plano && typeof snap.casas_por_plano === "object" ? paying : null);
  items.retencao_pct = snapVal(pct(nonNeg(snap.assinantes_retidos), nonNeg(snap.assinantes_base)));
  return { days, items, plans };
}

/** Texto do valor, na unidade do indicador; sem dado vira "—". */
export function formatIndicator(key, value) {
  const d = INDICATORS[key];
  if (!d || value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (d.unit) {
    case "pct": return `${String(value.toFixed(1)).replace(".", ",").replace(/,0$/, "")}%`;
    case "h": return value < 1 ? `${Math.round(value * 60)} min` : value < 48 ? `${value.toFixed(1).replace(".", ",").replace(/,0$/, "")} h` : `${(value / 24).toFixed(1).replace(".", ",").replace(/,0$/, "")} dias`;
    case "brl": return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    default: return Math.round(value).toLocaleString("pt-BR");
  }
}

/** Variação contra o período anterior: texto curto e se foi bom, ruim ou neutro. Sem base de comparação, não inventa. */
export function changeInfo(key, current, previous) {
  const d = INDICATORS[key];
  if (!d || d.snapshot || current === null || previous === null || current === undefined || previous === undefined) return { text: "", tone: "none" };
  const toneOf = (up) => (d.better === "none" ? "none" : (d.better === "up") === up ? "good" : "bad");
  if (previous === 0) return current === 0 ? { text: "igual ao período anterior", tone: "none" } : { text: "novo em relação ao período anterior", tone: toneOf(true) };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 0.5) return { text: "igual ao período anterior", tone: "none" };
  const up = diff > 0;
  return { text: `${up ? "+" : "−"}${Math.abs(Math.round(diff))}% sobre o período anterior`, tone: toneOf(up) };
}

/** Indicadores agrupados na ordem da tela. */
export function groupedIndicators(view) {
  return GROUPS.map((g) => ({
    group: g,
    items: Object.entries(INDICATORS).filter(([, d]) => d.group === g).map(([k, d]) => ({ key: k, ...d, ...(view.items[k] ?? { current: null, previous: null }) })),
  })).filter((g) => g.items.length > 0);
}
