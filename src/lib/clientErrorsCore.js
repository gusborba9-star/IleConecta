// Captura de erros do app: o que vale relatar e como montar o relato. Sem rede, sem tela (testável).
// O relato não leva nome, e-mail nem identificação da pessoa; o servidor ainda limpa ids, e-mails e números longos.

// Ruído que não é defeito do app: extensões do navegador, internet fora, abortos, avisos do navegador.
const IGNORAR = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /(chrome|moz|safari-web)-extension:\/\//i,
  /Non-Error promise rejection/i,
  /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|cancelled)( at .*)?$/i,
  /AbortError|The (operation|user aborted a request)/i,
  /^Error: Network request failed( at .*)?$/i,
];

export const MAX_POR_ABERTURA = 8;

export function textoDoErro(err) {
  if (err == null) return "";
  if (typeof err === "string") return err.trim();
  const nome = typeof err.name === "string" && err.name ? err.name : "Error";
  const msg = typeof err.message === "string" ? err.message : "";
  const pilha = typeof err.stack === "string" ? err.stack.split("\n").find((l) => /^\s*at\s/.test(l)) : "";
  const base = msg ? `${nome}: ${msg}` : nome;
  return pilha ? `${base} ${pilha.trim()}` : base;
}

export function deveIgnorar(texto) {
  const t = String(texto ?? "").trim();
  if (t.length < 2) return true;
  return IGNORAR.some((r) => r.test(t));
}

/** Tira o endereço do site do texto (sobra só o arquivo) e corta o tamanho. */
export function limpar(texto, origem = "") {
  let t = String(texto ?? "");
  if (origem) t = t.split(origem).join("");
  return t.replace(/\s+/g, " ").trim().slice(0, 380);
}

/**
 * Cria o relator. send(route, message) devolve uma promessa; nunca lança. Cada erro igual na mesma tela é relatado uma vez por abertura do app
 * e no máximo MAX_POR_ABERTURA relatos distintos por abertura.
 */
export function criarRelator({ send, origem = "" }) {
  const vistos = new Set();
  return function relatar(err, route) {
    const texto = limpar(textoDoErro(err), origem);
    if (deveIgnorar(texto)) return false;
    const rota = String(route ?? "").split("?")[0].split("#")[0];
    const chave = `${rota}|${texto}`;
    if (vistos.has(chave) || vistos.size >= MAX_POR_ABERTURA) return false;
    vistos.add(chave);
    try { void Promise.resolve(send(rota, texto)).catch(() => {}); } catch { /* relatar nunca atrapalha o app */ }
    return true;
  };
}
