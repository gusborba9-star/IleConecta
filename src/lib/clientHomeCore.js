// "Para você": o que está acontecendo com o cliente (pedidos, mensalidades, reservas), montado só com dados que já existem.
// Puro (sem rede) para ser testado. Datas "AAAA-MM-DD" comparadas como texto (formato que ordena igual ao calendário).

const DAY = 86_400_000;
const dayDiff = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

/** Dia de hoje em São Paulo no formato AAAA-MM-DD. */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const brDay = (iso) => todayBR(new Date(iso));

/**
 * @param {{orders?: Array<{id:string,title:string,status:string,houseName?:string,houseOwnerId?:string|null,scheduledAt?:string|null}>,
 *          memberships?: Array<{memberId:string,houseName:string,dues:Array<{id:string,dueDate:string,status:string,amountCents:number}>}>,
 *          reservations?: Array<{id:string,status:string,title:string,houseName:string,startsAt:string}>,
 *          today: string}} d
 * @returns {Array<{id:string,kind:string,critical:boolean,title:string,detail:string,to:string,order:number}>}
 */
export function buildClientItems({ orders = [], memberships = [], reservations = [], today }) {
  const out = [];
  for (const o of orders) {
    if (o.status === "aguardando_pagamento") out.push({ id: `pedido-${o.id}`, kind: "pagar_pedido", critical: true, title: "Pagar pedido", detail: [o.title, o.houseName].filter(Boolean).join(" · "), to: "/perfil?aba=atividade", order: 10 });
    else if (o.status === "em_andamento") out.push({ id: `pedido-${o.id}`, kind: "pedido_andamento", critical: false, title: "Pedido em andamento", detail: [o.title, o.houseName].filter(Boolean).join(" · "), to: "/perfil?aba=atividade", order: 40 });
    else if (o.status === "confirmado") out.push({ id: `pedido-${o.id}`, kind: "pedido_confirmado", critical: false, title: "Pedido confirmado", detail: [o.title, o.houseName].filter(Boolean).join(" · "), to: "/perfil?aba=atividade", order: 45 });
    else if (o.status === "reembolso_pendente") out.push({ id: `pedido-${o.id}`, kind: "reembolso", critical: false, title: "Reembolso em andamento", detail: [o.title, o.houseName].filter(Boolean).join(" · "), to: "/perfil?aba=atividade", order: 50 });
  }
  for (const m of memberships) {
    const open = (m.dues ?? []).filter((d) => d.status === "aberta").sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const next = open[0];
    if (!next) continue;
    const diff = dayDiff(today, next.dueDate);
    if (diff < 0) out.push({ id: `mensalidade-${next.id}`, kind: "mensalidade_vencida", critical: true, title: "Mensalidade vencida", detail: `${m.houseName}${open.length > 1 ? ` · ${open.length} em aberto` : ""}`, to: "/perfil?aba=mensalidades", order: 5 });
    else if (diff <= 5) out.push({ id: `mensalidade-${next.id}`, kind: "mensalidade_perto", critical: false, title: diff === 0 ? "Mensalidade vence hoje" : `Mensalidade vence em ${diff} ${diff === 1 ? "dia" : "dias"}`, detail: m.houseName, to: "/perfil?aba=mensalidades", order: 20 });
  }
  for (const r of reservations) {
    const diff = dayDiff(today, brDay(r.startsAt));
    if (diff < 0) continue;
    if (r.status === "aguardando_pagamento") out.push({ id: `reserva-${r.id}`, kind: "pagar_reserva", critical: true, title: "Pagar reserva do ritual", detail: `${r.title} · ${r.houseName}`, to: "/rituais", order: 12 });
    else if (r.status === "confirmada" && diff <= 2) out.push({ id: `reserva-${r.id}`, kind: "ritual_perto", critical: false, title: diff === 0 ? "Seu ritual é hoje" : diff === 1 ? "Seu ritual é amanhã" : "Seu ritual é em 2 dias", detail: `${r.title} · ${r.houseName}`, to: "/rituais", order: 15 });
  }
  return out.sort((a, b) => a.order - b.order);
}

/** Itens que ficam à vista mesmo com a faixa minimizada. */
export const criticalItems = (items) => items.filter((i) => i.critical);
