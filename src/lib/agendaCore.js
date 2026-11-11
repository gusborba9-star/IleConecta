// Regras puras da agenda (sem rede), testáveis em Node. Horários sempre no fuso de Brasília.
export const TZ = "America/Sao_Paulo";
export const WEEKDAYS = [
  { id: 1, label: "Segunda" },
  { id: 2, label: "Terça" },
  { id: 3, label: "Quarta" },
  { id: 4, label: "Quinta" },
  { id: 5, label: "Sexta" },
  { id: 6, label: "Sábado" },
  { id: 0, label: "Domingo" },
];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Janela semanal "09:00" até "12:00". Devolve o erro em português ou null. */
export function validateWindow(start, end) {
  if (!HHMM.test(String(start)) || !HHMM.test(String(end))) return "Informe os horários no formato 09:00.";
  if (String(end) <= String(start)) return "O fim precisa ser depois do início.";
  return null;
}

/** "2026-11-03T12:00:00Z" → { day: "2026-11-03", time: "09:00" } em Brasília. */
export function partsInBrasilia(iso) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** "03/11 às 09:00" */
export function formatSlot(iso) {
  const { day, time } = partsInBrasilia(iso);
  return `${day.slice(8, 10)}/${day.slice(5, 7)} às ${time}`;
}

const WEEK_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Agrupa horários por dia, em ordem. */
export function groupSlots(isoList) {
  const days = new Map();
  for (const iso of [...isoList].sort()) {
    const { day, time } = partsInBrasilia(iso);
    if (!days.has(day)) {
      const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
      days.set(day, { day, label: `${WEEK_SHORT[dow]}, ${day.slice(8, 10)}/${day.slice(5, 7)}`, slots: [] });
    }
    days.get(day).slots.push({ iso, time });
  }
  return [...days.values()];
}

/** Converte "2026-11-03" + "09:00" (Brasília, UTC-3) em ISO UTC. */
export function brasiliaToIso(day, time) {
  return new Date(`${day}T${time}:00-03:00`).toISOString();
}

const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));

/** Datas do calendário com hora viram compromissos de 2 h nos próximos `days` dias (mesma regra do banco). */
export function calendarOccurrences(items, fromDay, days = 60) {
  const out = [];
  const start = new Date(`${fromDay}T12:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const day = d.toISOString().slice(0, 10);
    for (const it of items) {
      if (!it?.onTime || !it?.onDate) continue;
      const same = it.onDate === day || (it.yearly && it.onDate.slice(5) === day.slice(5));
      if (!same) continue;
      const time = String(it.onTime).slice(0, 5);
      out.push({ startsAt: brasiliaToIso(day, time), endsAt: new Date(new Date(brasiliaToIso(day, time)).getTime() + 2 * 3600000).toISOString(), label: it.title });
    }
  }
  return out;
}

/**
 * Compromissos já marcados que caem dentro de um horário semanal que a casa vai cadastrar.
 * `busy`: [{ startsAt, endsAt, label }]. Devolve até 5, em ordem: [{ when: "ter, 18/11 às 15:00", label }].
 */
export function conflictsForWindow(weekday, start, end, busy, now = new Date()) {
  const s = toMin(start), e = toMin(end);
  const found = [];
  for (const b of busy ?? []) {
    if (new Date(b.endsAt) <= now) continue;
    const a = partsInBrasilia(b.startsAt);
    const dow = new Date(`${a.day}T12:00:00Z`).getUTCDay();
    if (dow !== weekday) continue;
    const bs = toMin(a.time);
    const be = Math.min(bs + Math.round((new Date(b.endsAt) - new Date(b.startsAt)) / 60000), 24 * 60);
    if (bs < e && be > s) found.push({ startsAt: b.startsAt, when: `${WEEK_SHORT[dow]}, ${formatSlot(b.startsAt)}`, label: b.label });
  }
  return found.sort((x, y) => x.startsAt.localeCompare(y.startsAt)).slice(0, 5);
}

/** O horário novo se sobrepõe a outro que a casa já cadastrou no mesmo dia? */
export function overlapsExistingWindow(weekday, start, end, windows) {
  return (windows ?? []).some((w) => w.weekday === weekday && toMin(w.start) < toMin(end) && toMin(w.end) > toMin(start));
}
