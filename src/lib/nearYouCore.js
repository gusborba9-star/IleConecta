// "Na sua cidade e em destaque": próximas giras e rituais, com a cidade do cliente e as casas em destaque na frente. Sem React: testável.
const plain = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** Dia e mês em horário de Brasília, para o bloco de data. */
export function dateBlock(iso) {
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return { day: g("day"), month: MESES[Number(g("month")) - 1] ?? "", time: `${g("hour")}h${g("minute") === "00" ? "" : g("minute")}` };
}

/**
 * rituals: { id, ownerId, houseName, title, startsAt, seatsTotal, taken, status }.
 * cityOf(ownerId) → cidade da casa. Ordem: casa em destaque, mesma cidade, mais próximo no tempo. Esgotados vão ao fim.
 */
export function pickNearYou({ rituals, cityOf, viewerCity, highlightOwners = [], now = Date.now(), limit = 8 }) {
  const hi = new Set(highlightOwners);
  const mine = plain(viewerCity);
  const rows = (rituals ?? [])
    .filter((r) => r && r.ownerId && r.status === "publicado" && Date.parse(r.startsAt) > now - 2 * 3600e3)
    .map((r) => {
      const city = String(cityOf(r.ownerId) ?? "");
      const left = Math.max(0, Number(r.seatsTotal) - Number(r.taken));
      return { ...r, city, left, soldOut: left === 0, featured: hi.has(r.ownerId), near: mine !== "" && plain(city) === mine };
    });
  rows.sort((a, b) => (a.soldOut - b.soldOut) || (b.featured - a.featured) || (b.near - a.near) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return rows.slice(0, limit);
}
