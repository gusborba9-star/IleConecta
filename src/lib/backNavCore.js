// Botão "Voltar" das telas internas: onde aparece e para onde vai quando não há histórico (link aberto direto, por exemplo).

/** Telas principais (os ícones do topo e da barra de baixo): não têm "Voltar". */
const ROOTS = new Set(["/", "/mensagens", "/pedidos", "/agenda", "/descobrir", "/rituais"]);

/** Telas que já têm o próprio caminho de volta ou um menu próprio. */
const OWN_BACK = [/^\/mensagens\/[^/]+$/, /^\/suporte\/chamados\/[^/]+$/, /^\/admin(\/|$)/, /^\/pagamento\//, /^\/convite\//, /^\/equipe\/convite\//];

const trim = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export function showBack(pathname) {
  const p = trim(String(pathname || "/"));
  if (ROOTS.has(p)) return false;
  return !OWN_BACK.some((re) => re.test(p));
}

/** Tela "mãe": para onde o Voltar leva quando não existe tela anterior dentro do app. */
export function parentOf(pathname) {
  const p = trim(String(pathname || "/"));
  if (/^\/rituais\/[^/]+$/.test(p)) return "/rituais";
  if (/^\/suporte\/chamados/.test(p)) return "/suporte";
  if (p === "/destaques") return "/impulsionar";
  if (p === "/impulsionar") return "/";
  return "/";
}

/** Há tela anterior dentro do app? (react-router guarda a posição em history.state.idx) */
export function hasAppHistory(state) {
  return Boolean(state && typeof state.idx === "number" && state.idx > 0);
}
