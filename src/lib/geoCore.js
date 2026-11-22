// Da coordenada à cidade, sem serviço externo e sem enviar a posição a ninguém. Tabela: municípios do IBGE (nome, UF, lat, lon). Sem React: testável.
/** Distância em km entre dois pontos (haversine). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const MAX_KM = 80; // mais longe que isso do centro do município mais próximo = fora do alcance (mar, outro país)

/** Município mais próximo de (lat, lon). table: [[nome, uf, lat, lon], ...]. Devolve { city, state, km } ou null se fora do Brasil/sem dados. */
export function nearestPlace(lat, lon, table) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Array.isArray(table)) return null;
  let best = null, bestKm = Infinity;
  for (const row of table) {
    // descarta rápido o que está a mais de ~2 graus antes de calcular a distância exata
    if (Math.abs(row[2] - lat) > 2 || Math.abs(row[3] - lon) > 2.5) continue;
    const km = distanceKm(lat, lon, row[2], row[3]);
    if (km < bestKm) { bestKm = km; best = row; }
  }
  return best && bestKm <= MAX_KM ? { city: best[0], state: best[1], km: Math.round(bestKm) } : null;
}

export const TTL_DAYS = 7;

/** Valida o que foi guardado no aparelho: { city, state, at } com no máximo 7 dias. */
export function readPlaceNow(raw, now = Date.now()) {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v.city !== "string" || typeof v.state !== "string" || !v.city || !/^[A-Z]{2}$/.test(v.state)) return null;
    const at = Number(v.at);
    if (!Number.isFinite(at) || at > now + 60_000 || now - at > TTL_DAYS * 86_400_000) return null;
    return { city: v.city.slice(0, 80), state: v.state, at };
  } catch { return null; }
}
