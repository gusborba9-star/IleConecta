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
    summary: "Como funcionam os valores, o repasse e o reembolso.",
    sections: [
      {
        heading: "Quando há taxa",
        paragraphs: [
          "Vagas de rituais vendidas pela plataforma têm taxa de 15%. Serviços contratados pela plataforma têm taxa de 4%. Atendimentos combinados direto com a casa, fora da plataforma, não têm taxa.",
        ],
      },
      {
        heading: "Quando a casa recebe",
        paragraphs: [
          "O pagamento do cliente vai direto para a conta de pagamento da casa, sem retenção pela plataforma. A comissão da plataforma é descontada automaticamente em cada pagamento, e a tarifa do processador de pagamento (Stripe) é cobrada da casa.",
          "Se o cliente relatar falha na entrega dentro de 30 dias após a conclusão (art. 26 do Código de Defesa do Consumidor), a plataforma analisa. Se o reembolso for aprovado, o valor integral é devolvido ao cliente a partir da conta de pagamento da casa.",
        ],
      },
      {
        heading: "Cancelamento e reembolso",
        bullets: [
          "Antes de o ritual ou trabalho começar, o cliente cancela e recebe o reembolso integral, automaticamente (art. 49 do CDC).",
          "Depois de começar, o reembolso só vale quando a casa não realizou, não entregou como combinado ou houve cobrança indevida.",
          "Insatisfação com o resultado de ordem espiritual não gera reembolso.",
        ],
      },
      {
        heading: "Pagamentos",
        paragraphs: ["Os pagamentos são processados pelo Stripe, por cartão ou Pix. Cada pagamento tem um valor máximo definido pela plataforma; serviços acima dele podem ser pagos em etapas. A contratação paga está em fase de testes e será liberada aos poucos."],
      },
    ],
  },
  {
    slug: "termos-do-cliente",
    title: "Termos de Uso do cliente",
    summary: "Regras para quem contrata rituais e serviços pela plataforma.",
    sections: [
      {
        heading: "1. Objeto e natureza da plataforma",
        paragraphs: [
          `A ${BRAND} é uma plataforma digital que atua exclusivamente como intermediária de aproximação, agendamento e facilitação de pagamentos entre clientes e casas espirituais. A plataforma não presta serviços religiosos, consultas, ritos ou trabalhos espirituais: eles são oferecidos, realizados e de responsabilidade direta e exclusiva de cada casa.`,
        ],
      },
      {
        heading: "2. Assistente virtual",
        paragraphs: [
          "A plataforma oferece um atendimento automatizado, com inteligência artificial, para esclarecer dúvidas sobre horários, valores e procedimentos. A assistente virtual não é dirigente espiritual, não realiza ritos ou adivinhações, não dá conselhos religiosos personalizados e não substitui o acolhimento direto da casa.",
        ],
      },
      {
        heading: "3. Dados pessoais sensíveis",
        paragraphs: [
          "Para contratar, você pode informar dados ligados à sua fé, pedidos de oração ou questões íntimas. Esses dados são sensíveis e tratados somente com o seu consentimento, para permitir a prestação do serviço pela casa escolhida, conforme a Política de Privacidade.",
        ],
      },
      {
        heading: "4. Cancelamento, arrependimento e reembolso",
        bullets: [
          "4.1. Você pode cancelar sem motivo e receber o valor integral a qualquer momento antes do início da prestação (início da transmissão ou do evento presencial, ou início do trabalho registrado na plataforma). Nesse caso o reembolso é automático (CDC, art. 49).",
          "4.2. Depois que o ritual ou trabalho começou, não existe mais o cancelamento sem motivo. O reembolso só é possível se a casa não realizou o serviço, esteve ausente sem justificativa ou houve cobrança indevida.",
          "4.3. A insatisfação com desfechos subjetivos (material, amoroso, financeiro ou de saúde) não dá direito a reembolso, pelo caráter religioso e imponderável da fé.",
          "4.4. Você pode relatar um problema na entrega em até 30 dias após a conclusão (CDC, art. 26). A equipe analisa o relato e informa a decisão.",
        ],
      },
      {
        heading: "5. Conduta e uso aceitável",
        paragraphs: [
          "Interaja com respeito às tradições e aos praticantes. É proibido usar a plataforma para fins ilícitos, ameaçar a integridade física de terceiros, praticar discurso de ódio ou assédio, ou fraudar meios de pagamento. O descumprimento pode levar ao bloqueio da conta e à comunicação às autoridades.",
        ],
      },
    ],
  },
  {
    slug: "termos-da-casa",
    title: "Termos de Uso da Casa Espiritual",
    summary: "Regras para casas que vendem rituais e serviços pela plataforma.",
    sections: [
      {
        heading: "Cadastro e natureza da relação",
        paragraphs: [
          "A casa pode se cadastrar como pessoa física (CPF) ou jurídica (CNPJ), declarando que as informações são verdadeiras. A plataforma atua somente como canal tecnológico de intermediação, sem sociedade, agenciamento, vínculo trabalhista ou subordinação.",
        ],
      },
      {
        heading: "Recebimento, tarifas e comissão",
        paragraphs: [
          "Os pagamentos são processados pelo Stripe e caem direto na conta de pagamento da casa, sem retenção pela plataforma. A tarifa do Stripe é cobrada da casa. A comissão da plataforma (15% sobre rituais com vagas e 4% sobre serviços contratados pela plataforma) é descontada automaticamente em cada pagamento. Para receber, a casa cadastra a sua conta de pagamento no Stripe e mantém os dados em dia.",
        ],
      },
      {
        heading: "Reembolsos, estornos e débitos futuros",
        paragraphs: [
          "Em cancelamento antes do início, o valor integral é devolvido ao cliente automaticamente, a partir da conta de pagamento da casa, junto com a comissão da plataforma. O mesmo vale quando for constatada falha na prestação, ausência da casa ou for aprovado reembolso fundamentado do cliente: o valor integral é devolvido a partir da conta da casa.",
          "A casa deve guardar comprovação da execução (por exemplo, registro de horário ou confirmação de envio) para eventual análise de relato de problema, que o cliente pode fazer em até 30 dias após a conclusão.",
        ],
      },
      {
        heading: "Execução e contestações",
        paragraphs: [
          "A casa se obriga a prestar os serviços nos termos, datas, horários e condições divulgados. Contestações de compra (chargeback) ou bloqueios por desacordo comercial imputável à casa são de responsabilidade dela, pelo valor contestado e pelas tarifas decorrentes. A não realização injustificada pode levar à suspensão da conta.",
        ],
      },
      {
        heading: "Tributos",
        paragraphs: [
          "Cabe exclusivamente à casa apurar, declarar e recolher os tributos incidentes sobre as receitas dos seus serviços. A plataforma emite documento fiscal apenas da comissão de intermediação que cobra.",
        ],
      },
      {
        heading: "Vedações e inexistência de garantia de resultado",
        paragraphs: [
          "É proibido prometer, divulgar ou sugerir garantia de resultado específico, prazos certos para desfechos de vida privada, saúde, reconciliação ou ganhos financeiros. Os serviços têm natureza espiritual e de convicção pessoal. A casa responde por qualquer publicidade que induza o cliente a erro.",
        ],
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
        heading: "Dados sensíveis (convicção religiosa)",
        paragraphs: [
          "Ao contratar, você pode informar dados que revelam a sua convicção religiosa ou necessidades espirituais. São dados sensíveis, tratados com base no seu consentimento específico e destacado (LGPD, art. 11), somente para: permitir o agendamento e a execução do serviço; viabilizar a comunicação com a casa escolhida; e permitir a cobrança e o suporte. Eles não são compartilhados com terceiros alheios ao serviço nem usados para outras finalidades.",
        ],
      },
      {
        heading: "Quanto tempo guardamos",
        bullets: [
          "Registros de acesso: por no mínimo 6 meses (Marco Civil da Internet, Lei nº 12.965/2014, art. 15).",
          "Registros de pagamentos e transações: por 5 anos, para obrigações fiscais e eventual defesa em processos.",
          "Se você pedir a exclusão, apagamos os dados da visualização ativa e mantemos, em sigilo, apenas o que a lei exige guardar.",
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
