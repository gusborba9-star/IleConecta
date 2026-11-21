// Horário e separador de dia das mensagens do chat (como no WhatsApp): "10:30" na bolha e "Hoje"/"Ontem"/"22 de julho de 2026" entre os dias.

const TZ = undefined; // fuso do aparelho

/** "10:30" no fuso do aparelho (ou no fuso dado, nos testes). */
export function clockTime(iso, timeZone = TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
}

/** Chave do dia (AAAA-MM-DD) no fuso dado. */
export function dayKey(iso, timeZone = TZ) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(d);
}

/** "Hoje", "Ontem" ou "22 de julho de 2026". */
export function dayLabel(iso, now = Date.now(), timeZone = TZ) {
  const k = dayKey(iso, timeZone);
  if (!k) return "";
  if (k === dayKey(new Date(now).toISOString(), timeZone)) return "Hoje";
  if (k === dayKey(new Date(now - 86_400_000).toISOString(), timeZone)) return "Ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone });
}

/** Marca, para cada mensagem, se ela abre um dia novo e se continua a sequência de quem enviou a anterior (para agrupar as bolhas). */
export function decorateMessages(msgs, senderOf, timeZone = TZ) {
  let prevDay = "";
  let prevSender = null;
  return msgs.map((m) => {
    const day = dayKey(m.createdAt, timeZone);
    const sender = senderOf(m);
    const out = { message: m, newDay: day !== prevDay, sameSenderAsPrev: day === prevDay && sender === prevSender };
    prevDay = day;
    prevSender = sender;
    return out;
  });
}
