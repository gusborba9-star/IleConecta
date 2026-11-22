// Lista local de anúncios já vistos neste aparelho: cada item guarda a data e expira sozinho.
export const SEEN_TTL_MS = 30 * 24 * 3600 * 1000;
export const SEEN_MAX = 500;

/** Aceita o formato antigo (lista de ids) e o novo ({id: tempo}); devolve só o que ainda vale. */
export function readSeen(raw, now = Date.now()) {
  let v;
  try { v = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
  const out = {};
  if (Array.isArray(v)) { for (const id of v) if (typeof id === "string") out[id] = now; }
  else if (v && typeof v === "object") {
    for (const [id, t] of Object.entries(v)) if (typeof t === "number" && now - t < SEEN_TTL_MS && t <= now + 60000) out[id] = t;
  }
  return out;
}

/** Marca ids como vistos e mantém no máximo SEEN_MAX (os mais recentes). */
export function addSeen(map, ids, now = Date.now()) {
  const next = { ...map };
  for (const id of ids) next[id] = now;
  const entries = Object.entries(next).sort((a, b) => a[1] - b[1]).slice(-SEEN_MAX);
  return Object.fromEntries(entries);
}
