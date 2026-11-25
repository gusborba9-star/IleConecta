// "Foco" de um item: a central de pendências abre a tela de destino com ?foco=<id do item>, e a tela rola até a linha e a destaca.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Só aceita UUID: o valor vem da URL e entra num seletor, então nunca pode carregar outra coisa. */
export function readFocus(raw) {
  return typeof raw === "string" && UUID.test(raw) ? raw.toLowerCase() : null;
}
/** Atributos da linha que pode receber foco. */
export function focusRow(id) {
  return typeof id === "string" && UUID.test(id) ? { "data-foco": id.toLowerCase() } : {};
}
/** Endereço do painel da administração: módulo (?s=), tela (?c=) e item em foco (?foco=). Sem módulo = tela inicial. */
export function adminPath(section, refId, screen) {
  const f = readFocus(refId);
  const base = section === "visao" || !section ? "" : `s=${encodeURIComponent(section)}`;
  const c = base && typeof screen === "string" && /^[a-z0-9-]{1,40}$/.test(screen) ? `c=${screen}` : "";
  const q = [base, c, f ? `foco=${f}` : ""].filter(Boolean).join("&");
  return q ? `?${q}` : "";
}
