// Token de atribuição do anúncio: o servidor assina; o aparelho só guarda e reapresenta. Aqui só se LÊ o conteúdo (sem validar assinatura, que é do servidor). Sem React: testável.
export const MAX_TOKENS = 20;

/** Lê o conteúdo do token ("<hex do json>.<assinatura>"). Devolve { p, h, iat, exp } ou null se estiver malformado. */
export function decodeToken(token) {
  try {
    if (typeof token !== "string" || token.length > 2000) return null;
    const [hex, sig] = token.split(".");
    if (!hex || !sig || !/^[0-9a-f]+$/.test(hex) || hex.length % 2) return null;
    const bytes = new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
    const j = JSON.parse(new TextDecoder().decode(bytes));
    if (j?.v !== 1 || typeof j.p !== "string" || typeof j.h !== "string" || !Number.isFinite(j.iat) || !Number.isFinite(j.exp)) return null;
    return { p: j.p, h: j.h, iat: j.iat, exp: j.exp };
  } catch { return null; }
}

/** Guarda o token mais recente por casa (último anúncio aberto vence), descartando vencidos. store: { [houseId]: token }. */
export function remember(store, token, nowMs = Date.now()) {
  const d = decodeToken(token);
  const out = {};
  for (const [h, t] of Object.entries(store ?? {})) { const x = decodeToken(t); if (x && x.exp * 1000 > nowMs) out[h] = t; }
  if (d && d.exp * 1000 > nowMs && d.iat * 1000 <= nowMs + 60_000) out[d.h] = token;
  const keep = Object.entries(out).sort((a, b) => decodeToken(b[1]).iat - decodeToken(a[1]).iat).slice(0, MAX_TOKENS);
  return Object.fromEntries(keep);
}

/** Tokens ainda válidos, do mais recente para o mais antigo (o servidor decide qual combina com a conversa/pedido/reserva). */
export function candidates(store, nowMs = Date.now(), limit = 4) {
  return Object.values(store ?? {})
    .map((t) => ({ t, d: decodeToken(t) }))
    .filter((x) => x.d && x.d.exp * 1000 > nowMs)
    .sort((a, b) => b.d.iat - a.d.iat)
    .slice(0, limit)
    .map((x) => x.t);
}
