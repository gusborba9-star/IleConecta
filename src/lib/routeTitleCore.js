// Título de cada tela (leitores de tela e abas do navegador). Sem rede, testável.
const EXATOS = {
  "/": "Início", "/login": "Entrar", "/register": "Criar conta", "/recuperar-senha": "Recuperar acesso", "/redefinir-senha": "Nova senha",
  "/comunidade": "Comunidade", "/descobrir": "Casas", "/rituais": "Rituais", "/perfil": "Meu perfil", "/mensagens": "Mensagens", "/impulsionar": "Impulsionar",
  "/destaques": "Destaques", "/planos": "Planos e faturas", "/pedidos": "Pedidos", "/agenda": "Agenda", "/recebimentos": "Recebimentos", "/crescer": "Crescer", "/atividade": "Atividade", "/suporte": "Suporte", "/suporte/chamados": "Meus chamados", "/termos": "Termos e normas", "/creditos-de-audio": "Créditos de áudio",
  "/moderacao": "Moderação", "/painel/membros": "Membros", "/divulgacao": "Divulgação", "/equipe": "Equipe", "/atendimento": "Atendimento", "/mensalidades": "Mensalidades",
  "/pessoas": "Pessoas", "/admin": "Administração", "/pagamento/retorno": "Pagamento", "/pagamento/conta": "Pagamento",
};
const PREFIXOS = [["/rituais/", "Ritual"], ["/casa/", "Casa"], ["/mensagens/", "Mensagens"], ["/suporte/chamados/", "Chamado"], ["/equipe/convite/", "Convite da equipe"], ["/convite/", "Convite"], ["/sobre/", "Informações"]];

/** Título da tela ou null quando a própria tela define o dele (página pública da casa). */
export function routeTitle(pathname) {
  const p = String(pathname ?? "/").replace(/\/+$/, "") || "/";
  if (p.startsWith("/c/")) return null;
  if (p in EXATOS) return EXATOS[p];
  for (const [pre, t] of PREFIXOS) if (p.startsWith(pre)) return t;
  return "Página não encontrada";
}

export const withBrand = (t) => (t && t !== "Início" ? `${t} · Ilê Conecta` : "Ilê Conecta");
