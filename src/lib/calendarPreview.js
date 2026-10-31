import { daysUntil, formatDay, formatTime, nextOccurrence, whenLabel } from "./calendarCore.js";

/** Como a data aparece, em texto, para quem a vê: "8 de dezembro · em 38 dias". */
export function whenText(item, today) {
  const next = nextOccurrence(item, today);
  if (!next) return `${formatDay(item.date, true)} (já passou)`;
  const days = daysUntil(next, today);
  const at = formatTime(item.time);
  return `${formatDay(next, !item.yearly)}${at ? `, às ${at}` : ""}${days !== null && days <= 60 ? ` · ${whenLabel(days)}` : ""}`;
}

/** Exemplo da resposta da Assistente para um cliente que pergunta pela data. */
export function assistantExample(item, today) {
  const title = String(item.title ?? "").trim() || "a data";
  const note = String(item.note ?? "").trim();
  const next = nextOccurrence(item, today);
  if (!next) return `${title} já aconteceu este ano. A casa ainda não marcou a próxima.`;
  const days = daysUntil(next, today);
  const at = formatTime(item.time);
  const when = `${formatDay(next, !item.yearly)}${at ? `, às ${at}` : ""}${days !== null && days <= 60 ? ` (${whenLabel(days)})` : ""}`;
  return `${title} será em ${when}.${note ? ` ${note}` : ""}`;
}

/** Quem vê o quê: o que mostrar em cada linha da prévia. */
export function previewRows(item, today) {
  const when = whenText(item, today);
  return [
    { key: "vis_public", label: "Página pública", on: item.vis_public, text: `${item.title} · ${when}`, off: "Não aparece para visitantes." },
    { key: "vis_followers", label: "Seguidores", on: item.vis_followers, text: `${item.title} · ${when}`, off: "Seguidores não veem esta data." },
    { key: "vis_house", label: "Agenda da casa", on: item.vis_house, text: `${item.title} · ${when}`, off: "Fora da agenda interna." },
    { key: "vis_assistant", label: "Assistente", on: item.vis_assistant, text: assistantExample(item, today), off: "A Assistente não menciona esta data." },
  ];
}
