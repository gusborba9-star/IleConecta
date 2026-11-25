// Mapa único do painel da administração (CRM): módulos (menu), telas (um assunto por tela), permissões e busca.
// O menu lateral, a barra do celular, os blocos da tela inicial, o buscador e as rotas leem ESTA lista: não há lista paralela para esquecer.
// Endereço: /admin (início) · /admin?s=<módulo> (lista de telas do módulo; módulo de uma tela só abre direto) · /admin?s=<módulo>&c=<tela>.
import { canModule } from "./adminAccessCore.js";

// need: módulo de acesso que libera ("dono" = só o dono). O banco decide de verdade (0139); aqui só mostramos o que a pessoa pode usar.
export const ADMIN_SCREENS = [
  // Números e saúde
  { id: "pendencias", module: "numeros", title: "Central de pendências", desc: "O que está esperando a administração, vencidos primeiro.", keys: "fila tarefas atrasos prazo", need: "indicadores" },
  { id: "indicadores", module: "numeros", title: "Indicadores da plataforma", desc: "Números do período, com o período anterior ao lado.", keys: "metricas numeros receita crescimento", need: "indicadores" },
  { id: "cadastros", module: "numeros", title: "Cadastros e planos", desc: "Contas, casas, clientes, cadastros por dia e casas por plano.", keys: "contas casas clientes assistente tokens", need: "indicadores" },
  { id: "cidades", module: "numeros", title: "Onde estão os usuários", desc: "Usuários por país, estado e cidade.", keys: "mapa regiao estado cidade", need: "indicadores" },
  { id: "equilibrio", module: "numeros", title: "Equilíbrio da divulgação", desc: "Quanto cada região tem de oferta e de procura.", keys: "divulgacao impulsionar destaque oferta", need: "indicadores" },
  { id: "saude", module: "numeros", title: "Saúde da plataforma", desc: "Erros do app, falhas da IA e das funções, rotinas e banco.", keys: "erros falhas alertas monitor banco", need: "dono" },
  { id: "emergencia", module: "numeros", title: "Interruptor de emergência", desc: "Pôr a plataforma em manutenção na hora.", keys: "manutencao desligar parar", need: "dono" },
  // Suporte, reembolsos, documentos e histórico: uma tela cada
  { id: "suporte", module: "suporte", title: "Suporte", desc: "Fila de chamados, dossiê e respostas.", keys: "chamados atendimento ajuda", need: "suporte" },
  { id: "reembolsos", module: "reembolsos", title: "Reembolsos", desc: "Pedidos de reembolso e disputas.", keys: "estorno devolucao disputa", need: "dono" },
  // Usuários
  { id: "casas", module: "usuarios", title: "Linha do tempo da casa", desc: "Os fatos da casa com a plataforma: plano, faturas, suporte, moderação.", keys: "casa historico timeline", need: "indicadores" },
  { id: "contas", module: "usuarios", title: "Contas de usuários", desc: "Buscar uma conta, suspender, reativar ou excluir.", keys: "usuarios suspender reativar excluir pessoas", need: "dono" },
  // Plataforma e planos
  { id: "operador", module: "plataforma", title: "Identificação do operador", desc: "Quem opera a plataforma, nos Termos e na Política.", keys: "cnpj cpf termos politica responsavel", need: "dono" },
  { id: "funcionalidades", module: "plataforma", title: "Funcionalidades", desc: "Ligar, desligar ou testar cada recurso da plataforma.", keys: "recursos beta liga desliga indique ganhe premio", need: "dono" },
  { id: "planos", module: "plataforma", title: "Planos: ferramentas e limites", desc: "O que cada plano libera, limites e textos.", keys: "matriz grátis essencial profissional premium plus limites", need: "dono" },
  { id: "plano-das-casas", module: "plataforma", title: "Plano de cada casa", desc: "Ver e trocar o plano de uma casa.", keys: "casa plano trocar", need: "dono" },
  { id: "vagas-destaque", module: "plataforma", title: "Vagas do destaque", desc: "Limite de casas em destaque por região.", keys: "destaques promo limite", need: "dono" },
  { id: "video", module: "plataforma", title: "Reuniões por vídeo", desc: "Limites, minutos e estado do vídeo.", keys: "video reuniao sala minutos plus", need: "dono" },
  { id: "recuperacao", module: "plataforma", title: "Recuperação de acesso", desc: "Trocar o e-mail de quem perdeu o acesso.", keys: "email senha acesso conta perdi", need: "dono" },
  { id: "seguranca", module: "plataforma", title: "Segurança: \"Não fui eu\"", desc: "Avisos de alteração que a pessoa não reconhece.", keys: "nao fui eu invasao alerta", need: "dono" },
  // Equipe e contas
  { id: "equipe-da-casa", module: "equipe", title: "Histórico da equipe de uma casa", desc: "Quem entrou e saiu da equipe de uma casa.", keys: "colaborador auditoria", need: "indicadores" },
  { id: "contas-voltaram", module: "equipe", title: "Contas que voltaram após exclusão", desc: "Cadastros novos de quem já tinha excluído a conta.", keys: "reutilizada recadastro", need: "comunicacao" },
  { id: "emails-em-comum", module: "equipe", title: "Contas com e-mail em comum", desc: "Contas ligadas ao mesmo e-mail.", keys: "duplicadas email", need: "comunicacao" },
  { id: "mesma-pessoa", module: "equipe", title: "Contas que podem ser da mesma pessoa", desc: "Sinais de mesma pessoa; ninguém é bloqueado por sinal.", keys: "rede cartao limite cadastros", need: "comunicacao" },
  // Moderação
  { id: "avaliacoes", module: "moderacao", title: "Avaliações contestadas", desc: "Avaliações denunciadas pela casa.", keys: "estrelas denuncia", need: "moderacao" },
  { id: "denuncias-chat", module: "moderacao", title: "Denúncias do chat", desc: "Conversas denunciadas e medidas aplicadas.", keys: "mensagens assedio conversa", need: "moderacao" },
  { id: "moderacao", module: "moderacao", title: "Conteúdos denunciados", desc: "Publicações, serviços e rituais para análise.", keys: "infracoes publicacoes remover promessas", need: "moderacao" },
  { id: "momentos", module: "moderacao", title: "Denúncias de momentos", desc: "Momentos denunciados, inclusive de crianças e adolescentes.", keys: "stories fotos videos crianca", need: "moderacao" },
  { id: "musicas", module: "moderacao", title: "Biblioteca de músicas", desc: "Músicas dos Momentos, licença e registro.", keys: "audio licenca direitos autorais", need: "dono" },
  // Comunicação
  { id: "avisos", module: "comunicacao", title: "Enviar aviso", desc: "Aviso da plataforma para todos, só casas, só clientes ou pessoas escolhidas.", keys: "comunicado notificacao mensagem", need: "comunicacao" },
  { id: "cpf-cnpj", module: "comunicacao", title: "CPF/CNPJ das casas", desc: "Documento da casa, para cobrança e notas.", keys: "documento fiscal nota", need: "dono" },
  // Dinheiro e preços
  { id: "financeiro", module: "dinheiro", title: "Painel financeiro", desc: "Volume, receita, assinaturas, tarifas e inconsistências.", keys: "dinheiro receita stripe pix conciliacao", need: "indicadores" },
  { id: "cobranca", module: "dinheiro", title: "Cobrança da plataforma", desc: "Cobrança das casas: ligar, regras e pendências.", keys: "fatura assinatura mensalidade cartao", need: "dono" },
  { id: "reajuste", module: "dinheiro", title: "Atualização da tabela comercial", desc: "Reajuste de mensalidade com aviso de 30 dias.", keys: "aumento preco vigencia", need: "dono" },
  { id: "taxas", module: "dinheiro", title: "Taxas da plataforma", desc: "Comissão por tipo de compra.", keys: "comissao porcentagem tarifa", need: "dono" },
  { id: "teto", module: "dinheiro", title: "Teto por pagamento", desc: "Valor máximo de cada pagamento pela plataforma.", keys: "limite pix valor maximo", need: "dono" },
  { id: "precos", module: "dinheiro", title: "Preços (R$)", desc: "Mensalidades, acesso extra da equipe, impulsionar e destaque.", keys: "valores tabela planos reais", need: "dono" },
  // Assistente e alcance
  { id: "avaliacao-ia", module: "assistente", title: "Avaliação da assistente", desc: "Teste da IA com o modelo real.", keys: "ia conecta inteligencia artificial eval", need: "dono" },
  { id: "alcance", module: "assistente", title: "Alcance por região", desc: "Onde Impulsionar e Destaques podem ser vendidos.", keys: "regioes cidade estado pais", need: "dono" },
  // Documentos e histórico
  { id: "docs", module: "docs", title: "Documentos", desc: "Termos, Política e demais documentos, com versões e provas.", keys: "termos politica lgpd dpa juridico", need: "dono" },
  { id: "historico", module: "historico", title: "Histórico de alterações", desc: "Quem mudou o quê e quando, com filtro por administrador.", keys: "auditoria log registro", need: "dono" },
];

// group: legenda no menu lateral.
export const ADMIN_MODULES = [
  { id: "numeros", label: "Números e saúde", group: "Operação", desc: "Pendências, indicadores e saúde" },
  { id: "suporte", label: "Suporte", group: "Operação", desc: "Chamados e atendimento" },
  { id: "reembolsos", label: "Reembolsos", group: "Operação", desc: "Pedidos e disputas" },
  { id: "usuarios", label: "Usuários", group: "Operação", desc: "Casas e contas" },
  { id: "plataforma", label: "Plataforma e planos", group: "Configurar", desc: "Recursos, planos e vídeo" },
  { id: "equipe", label: "Equipe e contas", group: "Configurar", desc: "Equipes e contas repetidas" },
  { id: "moderacao", label: "Moderação", group: "Configurar", desc: "Denúncias e músicas" },
  { id: "comunicacao", label: "Comunicação", group: "Configurar", desc: "Avisos e documentos fiscais" },
  { id: "dinheiro", label: "Dinheiro e preços", group: "Configurar", desc: "Financeiro, taxas e preços" },
  { id: "assistente", label: "Assistente e alcance", group: "Configurar", desc: "IA e alcance por região" },
  { id: "docs", label: "Documentos", group: "Registro", desc: "Termos e políticas" },
  { id: "historico", label: "Histórico", group: "Registro", desc: "Quem mudou o quê" },
];
export const ADMIN_GROUPS = ["Operação", "Configurar", "Registro"];
// Ordem de preferência para a barra de baixo do celular (as 4 primeiras que a pessoa puder abrir; o resto fica em "Mais").
export const BAR_PRIORITY = ["suporte", "usuarios", "moderacao", "dinheiro", "numeros"];

const byId = new Map(ADMIN_SCREENS.map((s) => [s.id, s]));
const modById = new Map(ADMIN_MODULES.map((m) => [m.id, m]));
export const screenById = (id) => (typeof id === "string" ? byId.get(id) ?? null : null);
export const moduleById = (id) => (typeof id === "string" ? modById.get(id) ?? null : null);

export const canScreen = (access, screen) => Boolean(screen) && canModule(access, screen.need);
export const screensOf = (access, moduleId) => ADMIN_SCREENS.filter((s) => s.module === moduleId && canScreen(access, s));
export const visibleModules = (access) => ADMIN_MODULES.filter((m) => screensOf(access, m.id).length > 0);

// Endereços antigos que ainda existem em links e e-mails: ?s=config era a lista única de configurações.
const ALIAS = { config: "plataforma", visao: null };

/**
 * Lê ?s= e ?c= e decide o que mostrar para esta pessoa:
 * hub (início) · module (lista de telas) · screen (uma tela) · none (conta da equipe sem nenhum módulo).
 * Quem não tem acesso ao pedido cai no início (nunca vê tela que não pode usar).
 */
export function resolveNav(access, rawS, rawC) {
  const mods = visibleModules(access);
  if (mods.length === 0) return { kind: "none" };
  const s = typeof rawS === "string" && rawS in ALIAS ? ALIAS[rawS] : rawS;
  const mod = moduleById(s);
  if (!mod || !mods.some((m) => m.id === mod.id)) return { kind: "hub" };
  const list = screensOf(access, mod.id);
  const wanted = screenById(rawC);
  if (wanted && wanted.module === mod.id && canScreen(access, wanted)) return { kind: "screen", module: mod, screen: wanted, single: list.length === 1 };
  // Módulo de uma tela só abre direto nela (Suporte, Reembolsos, Documentos, Histórico).
  if (list.length === 1) return { kind: "screen", module: mod, screen: list[0], single: true };
  return { kind: "module", module: mod, screens: list };
}

export const navPath = (moduleId, screenId) => {
  if (!moduleId) return "";
  const q = [`s=${encodeURIComponent(moduleId)}`, screenId ? `c=${encodeURIComponent(screenId)}` : ""].filter(Boolean).join("&");
  return `?${q}`;
};

/** Destino para <Link to=…> e navigate(): só muda a query, o painel continua em /admin. */
export const adminTo = (moduleId, screenId) => ({ search: navPath(moduleId, screenId) });

const norm = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Busca por título, descrição e palavras-chave, só entre as telas que a pessoa pode abrir; título que começa com o termo vem primeiro. */
export function searchScreens(access, q, limit = 8) {
  const t = norm(q).trim();
  if (t.length < 2) return [];
  const words = t.split(/\s+/);
  const hit = [];
  for (const s of ADMIN_SCREENS) {
    if (!canScreen(access, s)) continue;
    const mod = moduleById(s.module);
    const hay = norm(`${s.title} ${s.desc} ${s.keys} ${mod?.label ?? ""}`);
    if (!words.every((w) => hay.includes(w))) continue;
    hit.push({ screen: s, rank: norm(s.title).startsWith(t) ? 0 : norm(s.title).includes(t) ? 1 : 2 });
  }
  return hit.sort((a, b) => a.rank - b.rank).slice(0, limit).map((h) => h.screen);
}
