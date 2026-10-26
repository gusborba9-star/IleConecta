// Textos institucionais. Versão preliminar: precisa de revisão jurídica antes do lançamento público.
export const BRAND = "Ilê Conecta";
export const REVIEW_PENDING = true;

export interface InfoSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}
export interface InfoPage {
  slug: string;
  title: string;
  summary: string;
  sections: InfoSection[];
}

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "normas-de-uso",
    title: "Normas de uso",
    summary: "Regras para usar a plataforma com segurança e respeito.",
    sections: [
      {
        paragraphs: [
          `A ${BRAND} conecta casas espirituais e pessoas que buscam atendimento, rituais e comunidade. Ao criar uma conta, você concorda com estas normas.`,
        ],
      },
      {
        heading: "Sua conta",
        bullets: [
          "Use informações verdadeiras no cadastro e mantenha sua senha em segredo.",
          "Cada conta é de uma pessoa ou de uma casa. Não faça-se passar por outra pessoa ou casa.",
          "Casas são responsáveis por tudo o que publicam, vendem e prometem em sua página.",
        ],
      },
      {
        heading: "O que não é permitido",
        bullets: [
          "Conteúdo ilegal, discriminatório, violento ou que desrespeite outras religiões e tradições.",
          "Promessas de cura, ganho financeiro ou resultado garantido.",
          "Spam, golpes, venda fora da plataforma para fugir de regras, ou coleta indevida de dados de outros usuários.",
        ],
      },
      {
        heading: "Medidas da plataforma",
        paragraphs: ["Conteúdos e contas que violem estas normas podem ser removidos ou suspensos."],
      },
    ],
  },
  {
    slug: "conduta",
    title: "Código de conduta",
    summary: "Como esperamos que todos se tratem aqui.",
    sections: [
      {
        paragraphs: ["Respeito é a base da comunidade. A fé de cada pessoa merece cuidado, mesmo quando é diferente da sua."],
      },
      {
        heading: "Esperamos de todos",
        bullets: [
          "Tratar as pessoas com educação, dentro e fora dos chats.",
          "Não expor conversas ou dados de terceiros sem autorização.",
          "Denunciar condutas que violem as normas.",
        ],
      },
      {
        heading: "Esperamos das casas",
        bullets: [
          "Informar com clareza o que cada serviço ou ritual inclui, valores e datas.",
          "Não exigir senhas, dados de cartão ou documentos pelo chat.",
          "Não pressionar o cliente a contratar.",
        ],
      },
      {
        heading: "Assistente virtual",
        paragraphs: [
          "As assistentes das casas são programas de computador. Elas seguem as regras da plataforma e os valores cadastrados pela casa, e avisam quando precisam confirmar algo com a casa.",
        ],
      },
    ],
  },
  {
    slug: "eventos-e-taxas",
    title: "Eventos, taxa e repasse",
    summary: "Como funcionam os valores de eventos e rituais.",
    sections: [
      {
        heading: "Quando há taxa",
        paragraphs: [
          "A taxa da plataforma é de 17% e incide somente sobre eventos e rituais vendidos pela plataforma. Jogos de búzios e trabalhos não têm taxa sobre a venda.",
        ],
      },
      {
        heading: "Quando a casa recebe",
        paragraphs: [
          "O valor da casa fica retido por 3 dias após o término do evento. Esse prazo existe para o caso de pedidos de reembolso dos clientes. Passado o prazo, o valor é repassado à casa.",
        ],
      },
      {
        heading: "Pagamentos",
        paragraphs: ["A contratação paga ainda está em preparação. Quando for liberada, as regras completas de pagamento e reembolso serão publicadas aqui."],
      },
    ],
  },
  {
    slug: "privacidade-lgpd",
    title: "Privacidade e LGPD",
    summary: "Que dados usamos, para quê, e quais são os seus direitos.",
    sections: [
      {
        paragraphs: ["Tratamos dados pessoais de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)."],
      },
      {
        heading: "Dados que tratamos",
        bullets: [
          "Cadastro: nome, e-mail, cidade e estado, e o tipo de conta (cliente ou casa).",
          "Conteúdo: fotos, publicações, comentários e mensagens.",
          "Uso do sistema: ações dentro da plataforma, como reservas e conversas com a assistente.",
        ],
      },
      {
        heading: "Para que usamos",
        bullets: [
          "Criar e manter a sua conta e a página da casa.",
          "Permitir o contato entre clientes e casas.",
          "Dar segurança à plataforma e evitar fraudes.",
        ],
      },
      {
        heading: "Assistente virtual",
        paragraphs: [
          "As mensagens enviadas à assistente de uma casa são processadas por um provedor externo de inteligência artificial para gerar a resposta, e ficam registradas na conversa. Não envie senhas, dados de cartão ou documentos pelo chat.",
        ],
      },
      {
        heading: "Seus direitos",
        paragraphs: [
          "Você pode pedir acesso, correção, exclusão dos seus dados, entre outros direitos previstos em lei. Para isso, fale com o suporte.",
        ],
      },
    ],
  },
  {
    slug: "quem-somos",
    title: "Quem somos",
    summary: "O que é a plataforma e por que ela existe.",
    sections: [
      {
        paragraphs: [
          `A ${BRAND} é uma rede social para a comunidade espiritual. Cada casa tem a sua página, publica no feed, divulga serviços e rituais e atende os clientes. Cada pessoa descobre casas, conversa e acompanha o que contratou.`,
          "A assistente virtual ajuda a casa a atender melhor: responde dúvidas e apresenta serviços, sempre com os valores e regras definidos pela própria casa.",
        ],
      },
    ],
  },
  {
    slug: "visao",
    title: "Nossa visão",
    summary: "Para onde queremos ir.",
    sections: [
      {
        paragraphs: [
          "Ser o lugar onde as tradições espirituais encontram quem as procura, com respeito, transparência e tecnologia a serviço do atendimento, e não no lugar dele.",
        ],
      },
      {
        heading: "Princípios",
        bullets: [
          "Respeito a todas as tradições.",
          "Transparência de valores e regras.",
          "Segurança dos dados e dos pagamentos.",
          "Tecnologia que ajuda a casa, sem substituir o cuidado humano.",
        ],
      },
    ],
  },
];

export const findInfoPage = (slug: string | undefined) => INFO_PAGES.find((p) => p.slug === slug);
