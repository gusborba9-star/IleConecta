// Filtros dos rituais: modalidade, data, preço, vaga, casa verificada e nota. Sem React: testável.
// Regras: dias em horário de Brasília; filtros de grupos diferentes se somam (E); dentro de um grupo vale uma opção só;
// um grupo só aparece quando discrimina (pelo menos dois resultados diferentes) ou quando já está ligado.
export const TZ = "America/Sao_Paulo";
const DAY = 86_400_000;

export const MODES = [{ id: "presencial", label: "Presencial" }, { id: "distancia", label: "À distância" }]; // híbrido entra nas duas
export const WHEN = [{ id: "hoje", label: "Hoje" }, { id: "7dias", label: "Próximos 7 dias" }, { id: "mes", label: "Este mês" }];
// Faixas em centavos, fixas e públicas: grátis = 0; "Até R$ 50" = 1 a 5000; "R$ 50 a 150" = 5001 a 15000; "Acima de R$ 150" = mais de 15000.
export const PRICES = [
  { id: "gratis", label: "Grátis", min: 0, max: 0 },
  { id: "ate50", label: "Até R$ 50", min: 1, max: 5000 },
  { id: "de50a150", label: "R$ 50 a 150", min: 5001, max: 15000 },
  { id: "acima150", label: "Acima de R$ 150", min: 15001, max: Infinity },
];
export const EMPTY = { modo: "", quando: "", preco: "", vaga: false, verificada: false, nota: false };
export const MIN_RATING = 4;

/** Diferença entre Brasília e UTC (minutos, negativa) num instante, pelo calendário do navegador (não supõe horário de verão). */
export function tzOffsetMin(ms, tz = TZ) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
  const g = (t) => Number(p.find((x) => x.type === t)?.value);
  return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ms / 1000) * 1000) / 60000);
}
/** Meia-noite (início do dia) de Brasília que contém `ms`, em ms UTC. */
export function startOfDay(ms, tz = TZ) {
  const off = tzOffsetMin(ms, tz);
  const local = ms + off * 60000;
  const dayLocal = Math.floor(local / DAY) * DAY;
  let guess = dayLocal - off * 60000;
  const off2 = tzOffsetMin(guess, tz); // corrige se o deslocamento mudou durante o dia
  if (off2 !== off) guess = dayLocal - off2 * 60000;
  return guess;
}
/** Início do primeiro dia do mês seguinte, em Brasília. */
export function startOfNextMonth(ms, tz = TZ) {
  const off = tzOffsetMin(ms, tz);
  const l = new Date(ms + off * 60000);
  const first = Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 1);
  return startOfDay(first - tzOffsetMin(first, tz) * 60000 + 3 * 3600e3, tz);
}
export function whenRange(id, now = Date.now()) {
  const d0 = startOfDay(now);
  if (id === "hoje") return [d0, startOfDay(d0 + DAY + 3 * 3600e3)];
  if (id === "7dias") return [d0, startOfDay(d0 + 7 * DAY + 3 * 3600e3)];
  if (id === "mes") return [d0, startOfNextMonth(now)];
  return null;
}

const priceBand = (id) => PRICES.find((p) => p.id === id);

/** ctx: { now, taken: {id: n}, rating: (ownerId) => number } */
function pass(r, f, ctx, skip) {
  if (skip !== "modo" && f.modo) {
    const m = r.mode;
    if (!(m === "hibrido" || m === f.modo)) return false;
  }
  if (skip !== "quando" && f.quando) {
    const rg = whenRange(f.quando, ctx.now);
    const t = Date.parse(r.startsAt);
    if (rg && !(t >= rg[0] && t < rg[1])) return false;
  }
  if (skip !== "preco" && f.preco) {
    const b = priceBand(f.preco);
    if (b && !(r.priceCents >= b.min && r.priceCents <= b.max)) return false;
  }
  if (skip !== "vaga" && f.vaga) {
    const n = ctx.taken?.[r.id];
    if (n === undefined || r.seatsTotal - n <= 0) return false; // vaga desconhecida não entra: melhor omitir que prometer
  }
  if (skip !== "verificada" && f.verificada && r.houseVerified !== true) return false;
  if (skip !== "nota" && f.nota && !(ctx.rating?.(r.ownerId) >= MIN_RATING)) return false;
  return true;
}

export function applyFilters(list, f, ctx = {}) {
  const c = { now: Date.now(), ...ctx };
  return list.filter((r) => pass(r, { ...EMPTY, ...f }, c, null));
}

/**
 * Grupos de filtro com contagem. A contagem de cada opção considera os OUTROS filtros ligados (como se a opção fosse escolhida).
 * `show` = o grupo discrimina neste resultado ou já está ligado.
 */
export function facets(list, f, ctx = {}) {
  const c = { now: Date.now(), ...ctx };
  const F = { ...EMPTY, ...f };
  const base = (skip) => list.filter((r) => pass(r, F, c, skip));
  const count = (skip, pred) => base(skip).filter(pred).length;
  const opts = (skip, items, pred) => items.map((o) => ({ id: o.id, label: o.label, count: count(skip, (r) => pred(r, o)) }));
  const modeOpts = opts("modo", MODES, (r, o) => r.mode === "hibrido" || r.mode === o.id);
  const whenOpts = opts("quando", WHEN, (r, o) => { const g = whenRange(o.id, c.now); const t = Date.parse(r.startsAt); return t >= g[0] && t < g[1]; });
  const priceOpts = opts("preco", PRICES, (r, o) => r.priceCents >= o.min && r.priceCents <= o.max);
  const multi = (o, active) => active || o.filter((x) => x.count > 0).length >= 2;
  const flag = (skip, key, has, active) => {
    const b = base(skip);
    const yes = b.filter(has).length;
    // "Com vaga" só aparece com as vagas de todos conhecidas: sem isso a contagem prometeria o que não sabemos.
    const known = key !== "vaga" || b.every((r) => c.taken?.[r.id] !== undefined);
    return { count: yes, show: active || (known && yes > 0 && yes < b.length) };
  };
  const vaga = flag("vaga", "vaga", (r) => c.taken?.[r.id] !== undefined && r.seatsTotal - c.taken[r.id] > 0, F.vaga);
  const ver = flag("verificada", "verificada", (r) => r.houseVerified === true, F.verificada);
  const nota = flag("nota", "nota", (r) => c.rating?.(r.ownerId) >= MIN_RATING, F.nota);
  // "Esta noite/hoje" e "Próximos 7 dias" se sobrepõem de propósito: cada contagem é do próprio intervalo.
  return [
    { id: "modo", label: "Modalidade", kind: "one", options: modeOpts, show: multi(modeOpts, !!F.modo) },
    { id: "quando", label: "Quando", kind: "one", options: whenOpts, show: multi(whenOpts, !!F.quando) },
    { id: "preco", label: "Preço", kind: "one", options: priceOpts, show: multi(priceOpts, !!F.preco) },
    { id: "vaga", label: "Com vaga", kind: "flag", count: vaga.count, show: vaga.show },
    { id: "verificada", label: "Casa verificada", kind: "flag", count: ver.count, show: ver.show },
    { id: "nota", label: `Nota ${MIN_RATING}+`, kind: "flag", count: nota.count, show: nota.show },
  ];
}

/** Endereço compartilhável: só o que está ligado. */
export function toParams(f) {
  const F = { ...EMPTY, ...f }, p = new URLSearchParams();
  if (F.modo) p.set("modo", F.modo);
  if (F.quando) p.set("quando", F.quando);
  if (F.preco) p.set("preco", F.preco);
  if (F.vaga) p.set("vaga", "1");
  if (F.verificada) p.set("verificada", "1");
  if (F.nota) p.set("nota", "1");
  return p;
}
export function fromParams(p) {
  const get = (k) => p.get(k) ?? "";
  const pick = (v, list) => (list.some((x) => x.id === v) ? v : "");
  return { modo: pick(get("modo"), MODES), quando: pick(get("quando"), WHEN), preco: pick(get("preco"), PRICES), vaga: get("vaga") === "1", verificada: get("verificada") === "1", nota: get("nota") === "1" };
}
export const activeCount = (f) => Object.entries({ ...EMPTY, ...f }).filter(([, v]) => v !== "" && v !== false).length;

/** Os impulsionados que combinam com os filtros vão na frente e ficam fora da contagem do orgânico. */
export function splitBoosted(list, boostedIds) {
  const ids = boostedIds instanceof Set ? boostedIds : new Set(boostedIds);
  return { boosted: list.filter((r) => ids.has(r.id)), organic: list.filter((r) => !ids.has(r.id)) };
}
