// Mapa de telas do app para a assistente Conecta orientar "onde fica". Só caminhos que existem em src/App.tsx (há teste que confere).
export interface Screen { path: string; name: string; what: string; audience?: "cliente" | "casa" | "todos" | "admin" }
export const SCREENS: Screen[] = [
  { path: "/", name: "Início", what: "Resumo e atalhos.", audience: "todos" },
  { path: "/descobrir", name: "Casas", what: "Procurar casas por nome, cidade ou pelo que a pessoa precisa (Prosperidade, Amor, Proteção, Saúde, Orientação) e pelo botão Na minha cidade (só compara a cidade, não mede distância; viajando, o botão Usar minha localização atual troca para a cidade onde a pessoa está, por até 7 dias, com autorização do navegador); casas impulsionadas ou em destaque aparecem primeiro.", audience: "todos" },
  { path: "/rituais", name: "Rituais", what: "Rituais e encontros com vagas; reservar e pagar.", audience: "todos" },
  { path: "/mensagens", name: "Mensagens", what: "Conversas com casas e clientes. No menu ⋮ da conversa: bloquear e Relatar ocorrência.", audience: "todos" },
  { path: "/perfil?aba=atividade", name: "Minha atividade", what: "Reservas, pedidos e pagamentos do cliente; daqui se pede reembolso.", audience: "cliente" },
  { path: "/perfil?aba=mensalidades", name: "Mensalidades", what: "Mensalidades de membros.", audience: "cliente" },
  { path: "/perfil", name: "Perfil", what: "Dados do perfil e, para casas, a assistente virtual da casa.", audience: "todos" },
  { path: "/planos", name: "Planos e faturas", what: "Planos da casa (Base, Intermediário, Máximo) e limites, em abas: Meu plano, Mudar de plano e Cobranças (faturas, cartão e cadastro).", audience: "casa" },
  { path: "/agenda", name: "Agenda", what: "Agenda da casa: horários de atendimento, próximos atendimentos marcados e datas e eventos do ano. A assistente usa os mesmos horários.", audience: "casa" },
  { path: "/pedidos", name: "Pedidos", what: "Pedidos recebidos pela casa: em andamento e histórico; iniciar, concluir ou cancelar.", audience: "casa" },
  { path: "/recebimentos", name: "Recebimentos", what: "Cadastro e situação da conta de recebimento da casa no Stripe.", audience: "casa" },
  { path: "/painel/membros", name: "Membros", what: "Membros da casa.", audience: "casa" },
  { path: "/equipe", name: "Equipe da casa", what: "Convidar e gerir a equipe da casa.", audience: "casa" },
  { path: "/divulgacao", name: "Divulgação", what: "Divulgar a casa.", audience: "casa" },
  { path: "/impulsionar", name: "Impulsionar", what: "Impulsionar publicações ou a casa (aba da área Crescer, junto com Destaques).", audience: "casa" },
  { path: "/destaques", name: "Destaques", what: "Destaques nos feeds.", audience: "casa" },
  { path: "/creditos-de-audio", name: "Créditos de áudio", what: "Autoria e licença de cada música oferecida nos Momentos.", audience: "todos" },
  { path: "/termos", name: "Termos e normas", what: "Todos os documentos, seus aceites e a autorização de dados sensíveis.", audience: "todos" },
  { path: "/suporte", name: "Suporte", what: "Relatar ocorrência, Meus chamados, baixar meus dados e excluir a conta.", audience: "todos" },
  { path: "/suporte/chamados", name: "Meus chamados", what: "Acompanhar chamados, responder à equipe e enviar fotos ou documentos (só se você escolher).", audience: "todos" },
  { path: "/login", name: "Entrar", what: "Entrar na conta; aqui está o link “Esqueci a senha”.", audience: "todos" },
  { path: "/recuperar-senha", name: "Recuperar acesso", what: "Pedir por e-mail o link para criar nova senha.", audience: "todos" },
];
export const SCREEN_PATHS = SCREENS.map((s) => s.path);

/** Caminhos antigos que a Conecta (função no servidor) ainda pode propor até ser republicada; levam à mesma tela nova. */
const OLD_PATHS: Record<string, string> = { "/atividade": "/perfil?aba=atividade", "/mensalidades": "/perfil?aba=mensalidades" };
export const screenFor = (path: string) => SCREENS.find((s) => s.path === (OLD_PATHS[path] ?? path));
