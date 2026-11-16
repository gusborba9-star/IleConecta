// Indicadores da casa: leitura defensiva do que vem do banco (0132), contas derivadas e textos de definição e origem.
// O banco já filtra por casa e permissão (a equipe nunca recebe dinheiro, avaliações nem reembolsos); aqui só se aceita o formato esperado.
export const PERIODS = [7, 30, 90];

/** Cada indicador: nome, unidade, o que significa e de onde vem. "better": o que é melhor (para a cor da variação). */
export const INDICATORS = {
  pessoas_que_falaram: { group: "Atendimento", label: "Pessoas que falaram com a casa", unit: "n", better: "up",
    definition: "Quantas pessoas diferentes mandaram mensagem para a casa no período.", source: "Mensagens das conversas da casa. A casa e a assistente não entram na conta." },
  tempo_resposta_min: { group: "Atendimento", label: "Tempo de resposta (mediana)", unit: "min", better: "down",
    definition: "Metade das mensagens foi respondida em menos que este tempo. Conta cada vez que a pessoa escreve depois de a casa ter falado, até a casa (ou a assistente) responder.", source: "Mensagens das conversas. Mensagens seguidas da mesma pessoa contam uma vez; conversa sem resposta fica de fora." },
  novos_seguidores: { group: "Atendimento", label: "Novos seguidores", unit: "n", better: "up",
    definition: "Pessoas que passaram a seguir a casa no período.", source: "Seguidores da casa." },
  pedidos_criados: { group: "Vendas", label: "Pedidos criados", unit: "n", better: "up",
    definition: "Pedidos de serviço abertos no período, pagos ou não.", source: "Pedidos de serviço da casa." },
  pedidos_pagos: { group: "Vendas", label: "Pedidos pagos", unit: "n", better: "up",
    definition: "Dos pedidos criados no período, quantos estão pagos hoje (pagos, em andamento ou concluídos).", source: "Pedidos de serviço da casa, pelo estado de agora." },
  conversao_pct: { group: "Vendas", label: "Conversão dos pedidos", unit: "pct", better: "up",
    definition: "Pedidos pagos dividido pelos pedidos criados no período.", source: "Calculado a partir dos dois números acima." },
  pedidos_perdidos: { group: "Vendas", label: "Pedidos cancelados ou vencidos", unit: "n", better: "down",
    definition: "Pedidos criados no período que foram cancelados ou venceram sem pagamento.", source: "Pedidos de serviço da casa." },
  reservas_confirmadas: { group: "Rituais", label: "Vagas confirmadas", unit: "n", better: "up",
    definition: "Vagas de ritual com pagamento confirmado, reservadas no período.", source: "Reservas dos rituais da casa." },
  reservas_canceladas: { group: "Rituais", label: "Vagas canceladas ou vencidas", unit: "n", better: "down",
    definition: "Reservas do período que foram canceladas ou venceram sem pagamento.", source: "Reservas dos rituais da casa." },
  ocupacao_pct: { group: "Rituais", label: "Ocupação dos próximos rituais", unit: "pct", better: "up", snapshot: true,
    definition: "Vagas confirmadas dividido pelas vagas oferecidas nos rituais publicados que acontecem nos próximos 30 dias.", source: "Rituais publicados e suas reservas confirmadas, no momento." },
  volume_cents: { group: "Vendas", label: "Valor vendido", unit: "brl", better: "up", money: true,
    definition: "Soma dos pedidos pagos e das vagas confirmadas no período, pelo valor cobrado do cliente.", source: "Pedidos de serviço e rituais da casa. Só a titular vê." },
  ticket_medio_cents: { group: "Vendas", label: "Ticket médio", unit: "brl", better: "up", money: true,
    definition: "Valor vendido dividido pelo número de pedidos pagos mais vagas confirmadas.", source: "Calculado a partir do valor vendido. Só a titular vê." },
  clientes_no_periodo: { group: "Clientes", label: "Clientes que compraram", unit: "n", better: "up",
    definition: "Pessoas diferentes com ao menos um pedido pago ou vaga confirmada no período.", source: "Pedidos e reservas da casa." },
  recorrencia_pct: { group: "Clientes", label: "Clientes que voltaram", unit: "pct", better: "up",
    definition: "Dos clientes que compraram no período, quantos já tinham comprado antes do período.", source: "Pedidos e reservas da casa, no histórico." },
  reembolsos: { group: "Reputação", label: "Reembolsos pedidos", unit: "n", better: "down", money: true,
    definition: "Pedidos de reembolso feitos pelos clientes no período.", source: "Pedidos de reembolso da casa. Só a titular vê." },
  nota_media: { group: "Reputação", label: "Nota média", unit: "nota", better: "up", money: true,
    definition: "Média das notas das avaliações recebidas no período (as escondidas não entram).", source: "Avaliações da casa. Só a titular vê." },
  avaliacoes: { group: "Reputação", label: "Avaliações recebidas", unit: "n", better: "up", money: true,
    definition: "Avaliações visíveis recebidas no período.", source: "Avaliações da casa. Só a titular vê." },
  avaliacoes_sem_resposta: { group: "Reputação", label: "Avaliações sem resposta", unit: "n", better: "down", money: true, snapshot: true,
    definition: "Avaliações visíveis que a casa ainda não respondeu (de todo o tempo).", source: "Avaliações da casa. Só a titular vê." },
};
export const GROUPS = ["Atendimento", "Vendas", "Rituais", "Clientes", "Reputação"];
// Total de seguidores é só contexto para "Novos seguidores".
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rawNum = (v) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : num(v));
const nonNeg = (v) => { const n = rawNum(v); return n !== null && n >= 0 ? n : null; };
const pct = (a, b) => (a !== null && b !== null && b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const div = (a, b) => (a !== null && b !== null && b > 0 ? Math.round(a / b) : null);

function pair(raw, key) {
  const m = raw && typeof raw === "object" && raw.metrics && typeof raw.metrics === "object" ? raw.metrics[key] : null;
  return { current: nonNeg(m?.current), previous: nonNeg(m?.previous) };
}

/** Lê a resposta do banco e monta todos os indicadores (inclusive os derivados), sem nunca inventar número. */
export function readHouseIndicators(raw) {
  const empty = { days: 30, role: "titular", totalFollowers: 0, items: {} };
  if (!raw || typeof raw !== "object") return empty;
  const role = raw.role === "equipe" ? "equipe" : "titular";
  const days = PERIODS.includes(raw.days) ? raw.days : 30;
  const base = {};
  for (const k of ["pessoas_que_falaram", "tempo_resposta_min", "novos_seguidores", "pedidos_criados", "pedidos_pagos", "pedidos_perdidos", "reservas_confirmadas", "reservas_canceladas",
    "volume_cents", "clientes_no_periodo", "clientes_que_voltaram", "reembolsos", "avaliacoes", "nota_media"]) base[k] = pair(raw, k);
  const snap = raw.snapshot && typeof raw.snapshot === "object" ? raw.snapshot : {};
  const both = (f) => ({ current: f("current"), previous: f("previous") });
  const items = { ...base };
  items.conversao_pct = both((w) => pct(base.pedidos_pagos[w], base.pedidos_criados[w]));
  items.recorrencia_pct = both((w) => pct(base.clientes_que_voltaram[w], base.clientes_no_periodo[w]));
  items.ticket_medio_cents = both((w) => div(base.volume_cents[w], (base.pedidos_pagos[w] ?? 0) + (base.reservas_confirmadas[w] ?? 0)));
  items.ocupacao_pct = { current: nonNeg(snap.ocupacao_pct), previous: null };
  items.avaliacoes_sem_resposta = { current: nonNeg(snap.avaliacoes_sem_resposta), previous: null };
  delete items.clientes_que_voltaram;
  // A equipe nunca mostra o que é só da titular, mesmo que o servidor mandasse.
  if (role === "equipe") for (const [k, d] of Object.entries(INDICATORS)) if (d.money) items[k] = { current: null, previous: null };
  return { days, role, totalFollowers: nonNeg(snap.seguidores_total) ?? 0, items };
}

/** Texto do valor, na unidade do indicador; sem dado vira "—". */
export function formatIndicator(key, value) {
  const d = INDICATORS[key];
  if (!d || value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (d.unit) {
    case "pct": return `${String(value.toFixed(1)).replace(".", ",").replace(/,0$/, "")}%`;
    case "min": return value < 1 ? "menos de 1 min" : value < 60 ? `${Math.round(value)} min` : value < 1440 ? `${(value / 60).toFixed(1).replace(".", ",").replace(/,0$/, "")} h` : `${(value / 1440).toFixed(1).replace(".", ",").replace(/,0$/, "")} dias`;
    case "brl": return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "nota": return value.toFixed(1).replace(".", ",");
    default: return Math.round(value).toLocaleString("pt-BR");
  }
}

/** Variação contra o período anterior: texto curto e se foi bom, ruim ou neutro. Sem base de comparação, não inventa. */
export function changeInfo(key, current, previous) {
  const d = INDICATORS[key];
  if (!d || d.snapshot || current === null || previous === null || current === undefined || previous === undefined) return { text: "", tone: "none" };
  if (previous === 0) return current === 0 ? { text: "igual ao período anterior", tone: "none" } : { text: "novo em relação ao período anterior", tone: d.better === "up" ? "good" : "bad" };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 0.5) return { text: "igual ao período anterior", tone: "none" };
  const up = diff > 0;
  const good = d.better === "up" ? up : !up;
  return { text: `${up ? "+" : "−"}${Math.abs(Math.round(diff))}% sobre o período anterior`, tone: good ? "good" : "bad" };
}

/** Indicadores visíveis, agrupados e na ordem da tela; some o que a pessoa não pode ver. */
export function groupedIndicators(view) {
  return GROUPS.map((g) => ({
    group: g,
    items: Object.entries(INDICATORS).filter(([k, d]) => d.group === g && !(view.role === "equipe" && d.money)).map(([k, d]) => ({ key: k, ...d, ...(view.items[k] ?? { current: null, previous: null }) })),
  })).filter((g) => g.items.length > 0);
}
