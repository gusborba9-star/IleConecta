// Índice de equilíbrio da divulgação (só leitura, administração): leitura defensiva do banco e textos descritivos. Sem limite arbitrário de «equilíbrio».
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const title = (s) => String(s ?? "").split(/([ /])/).map((w) => (/^[ /]$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");

/** "cidade:sao paulo/sp" → { scope: "Cidade", place: "Sao Paulo/SP" } */
export function groupLabel(g) {
  const [scope, ...rest] = String(g ?? "").split(":");
  const key = rest.join(":");
  const name = { cidade: "Cidade", estado: "Estado", pais: "País" }[scope] ?? "Alcance";
  const place = scope === "cidade" && key.includes("/") ? `${title(key.split("/")[0])}/${key.split("/")[1].toUpperCase()}` : scope === "estado" ? key.toUpperCase() : key.toUpperCase();
  return { scope: name, place: place || "—" };
}

export function readEquity(raw) {
  return (Array.isArray(raw) ? raw : []).flatMap((g) => {
    if (!g || typeof g.group !== "string") return [];
    const items = (Array.isArray(g.items) ? g.items : []).flatMap((i) => i && typeof i.house_id === "string"
      ? [{ houseId: i.house_id, name: String(i.name ?? "Casa"), views: num(i.views), activeDays: num(i.active_days), exposure: num(i.exposure), share: num(i.share_pct) }] : []);
    return [{ ...groupLabel(g.group), group: g.group, houses: num(g.houses), totalViews: num(g.total_views), median: num(g.median_exposure), top: num(g.top_exposure), ratio: g.top_ratio == null ? null : num(g.top_ratio), items }];
  });
}

const br = (n) => String(n).replace(".", ",");

/** Frase descritiva do alcance: nunca diz «desequilibrado»; só descreve a distribuição observada. */
export function describeEquity(g) {
  if (g.houses < 2) return "Só uma casa com campanha ativa neste alcance no período: não há com o que comparar.";
  if (g.totalViews === 0) return "Nenhuma visualização registrada neste alcance no período.";
  const top = g.items[0];
  if (g.ratio == null) return `${top?.name ?? "A casa mais vista"} concentrou ${br(top?.share ?? 0)}% das visualizações; a exposição mediana por dia ativo foi zero.`;
  return `${top?.name ?? "A casa mais vista"} recebeu ${br(g.ratio)}× a exposição mediana por dia ativo (${br(g.top)} contra ${br(g.median)} visualizações/dia), com ${br(top?.share ?? 0)}% das visualizações entre ${g.houses} casas.`;
}
