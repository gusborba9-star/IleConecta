/**
 * Junta leituras idênticas que estão em andamento ao mesmo tempo (a Home do cliente chegava a pedir a mesma coisa 3 e 4 vezes,
 * de componentes diferentes). Só junta leitura: GET e as funções de leitura da lista abaixo. Qualquer escrita (ou função fora da lista)
 * passa direto e ainda esvazia a lista de pedidos em andamento, para uma leitura feita depois da escrita nunca receber resposta velha.
 */
export const READ_RPCS = new Set([
  "vitrine_hidden_house_ids", "video_my_upcoming", "house_follow_summary", "review_summary", "my_staff_house",
  "my_post_text_locks", "my_post_delete_states", "my_memberships", "promotions_visible", "moments_feed", "my_reviewable",
  "my_account_gate", "is_admin", "admin_my_access", "has_security_word",
]);

const RPC = /\/rest\/v1\/rpc\/([^/?]+)/;

function headersKey(headers) {
  if (!headers) return "";
  const h = new Headers(headers);
  return [...h.entries()].map(([k, v]) => `${k.toLowerCase()}=${v}`).sort().join("&");
}

/** Devolve true quando o pedido é uma leitura que pode ser compartilhada. */
export function isCoalescible(method, url) {
  const m = String(method || "GET").toUpperCase();
  if (!/\/rest\/v1\//.test(url)) return false;
  if (m === "GET") return true;
  if (m !== "POST") return false;
  const rpc = RPC.exec(url);
  return Boolean(rpc && READ_RPCS.has(rpc[1]));
}

export function createCoalescingFetch(baseFetch) {
  const inflight = new Map();
  return async function coalescingFetch(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    const body = init?.body;
    if (!isCoalescible(method, url) || (body != null && typeof body !== "string") || init?.signal) {
      if (String(method).toUpperCase() !== "GET") inflight.clear();
      return baseFetch(input, init);
    }
    const headers = init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined);
    const key = `${String(method).toUpperCase()} ${url} ${body ?? ""} ${headersKey(headers)}`;
    let p = inflight.get(key);
    if (!p) {
      p = baseFetch(input, init);
      inflight.set(key, p);
      const clear = () => { if (inflight.get(key) === p) inflight.delete(key); };
      p.then(clear, clear);
    }
    const res = await p;
    return res.clone();
  };
}
