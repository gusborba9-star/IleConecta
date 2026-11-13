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
      {
        heading: "6. Natureza dos serviços espirituais e isenção de responsabilidade",
        paragraphs: [
          `Você declara estar ciente de que consultas oraculares (como jogo de búzios e cartas), rituais, limpezas espirituais, aconselhamentos e trabalhos religiosos têm natureza espiritual, subjetiva e de fé. Os serviços são obrigação de meio (a realização do ritual ou atendimento conforme a tradição da casa), nunca obrigação de resultado. A ${BRAND} e as casas não garantem a concretização de desejos, curas físicas ou emocionais, retorno amoroso, ganhos financeiros ou qualquer resultado material específico.`,
          `Cada casa tem autonomia litúrgica, doutrinária e operacional sobre seus rituais, preços e orientações. A ${BRAND} não interfere nas práticas religiosas e não responde pela insatisfação com o teor das revelações ou com os efeitos espirituais percebidos, por decisões pessoais, financeiras, médicas ou jurídicas tomadas com base em aconselhamento espiritual, nem por materiais, insumos ou oferendas pedidos diretamente pela casa.`,
          "Os serviços religiosos têm caráter de fé e acolhimento espiritual e não substituem diagnósticos, tratamentos ou acompanhamentos médicos, psicológicos, psiquiátricos ou jurídicos.",
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
        heading: "Assinatura e cobrança recorrente",
        paragraphs: [
          `Para usar os recursos avançados de divulgação, gestão de perfil, agenda e intermediação de pagamentos, a casa pode contratar um dos planos pagos disponíveis no site e no aplicativo, com cobrança recorrente na periodicidade do plano escolhido. O valor da assinatura remunera exclusivamente a licença de uso da tecnologia e a vitrine digital da ${BRAND}, e não cria vínculo societário nem responsabilidade da plataforma sobre os serviços religiosos prestados pela casa.`,
        ],
        bullets: [
          "Autorização de cobrança automática: ao salvar um cartão de crédito válido e marcar a caixa de autorização, a casa (por meio do seu dirigente ou responsável cadastrado) autoriza a cobrança automática, periódica e sucessiva do valor do plano, pelos parceiros de pagamento, sem nova aprovação a cada ciclo. A caixa vem desmarcada e a autorização só vale depois de marcada. Sem ela, a cobrança é feita por Pix ou cartão avulso, a cada fatura.",
          "Renovação: o plano é renovado por períodos iguais e sucessivos, no mesmo cartão, até a casa cancelar nas configurações da conta. A casa pode desligar a cobrança automática, trocar ou remover o cartão a qualquer momento.",
          "Avisos: a casa recebe aviso 3 dias e 1 dia antes da cobrança automática, com a informação do cartão (final) e do valor.",
          "Falha no pagamento: se a cobrança não for aprovada no vencimento, por limite insuficiente, cartão vencido ou qualquer outro motivo, a plataforma faz novas tentativas automáticas nos dias seguintes (até 3 tentativas em dias consecutivos, contando o vencimento). Persistindo a falha, aplica-se a tolerância de 3 dias úteis, sem multa nem juros. Depois dela, a casa fica com suspensão parcial: conclui o que já estava em andamento, mas não pode fazer novas vendas ou reservas pela plataforma nem iniciar campanhas, e destaques e impulsionamentos ficam pausados. Mantém acesso aos próprios dados, e tudo volta ao normal com o pagamento.",
          "A suspensão não isenta a casa de eventuais taxas administrativas de atendimentos já intermediados antes dela.",
          "Reajuste: os valores dos planos podem ser atualizados pela tabela comercial da plataforma. Qualquer mudança de preço é avisada à casa, pelo aplicativo e pelo e-mail do responsável, com no mínimo 30 dias de antecedência da próxima renovação. Se a casa não concordar, pode cancelar sem multa antes da renovação.",
          "Cancelamento e reembolso: a casa cancela a qualquer momento no painel e mantém o acesso aos recursos do plano até o último dia do período já pago. Não há reembolso proporcional de dias não usados, ressalvado o direito de arrependimento: em até 7 dias corridos após o primeiro pagamento de um plano, a casa pode desistir e receber o valor integral pago, pelo mesmo meio de pagamento. As renovações seguintes não têm devolução.",
          "Créditos da assistente: a casa pode desistir da compra de um pacote em até 7 dias após o pagamento. Pacote sem uso é devolvido por inteiro; com uso parcial, devolve-se o valor proporcional às respostas ainda não usadas (a franquia do mês é usada primeiro). A tarifa do provedor de pagamento fica por conta da plataforma. Depois de 7 dias, não há devolução.",
          "Segurança e LGPD: os dados do cartão são processados de forma criptografada (tokenizada) apenas por instituições de pagamento parceiras certificadas (padrão PCI-DSS). A plataforma não tem acesso nem guarda o código de segurança (CVV) do cartão.",
        ],
      },
      {
        heading: "Natureza dos serviços e isenção de responsabilidade religiosa e espiritual",
        paragraphs: [
          `A ${BRAND} é uma plataforma digital que atua exclusivamente como intermediadora de tecnologia, oferecendo um ambiente virtual para que casas espirituais divulguem seus serviços e clientes agendem e paguem. Não é templo, terreiro ou instituição religiosa, não presta serviços espirituais próprios e não tem vínculo trabalhista, societário ou de subordinação com dirigentes, sacerdotes ou casas cadastradas.`,
        ],
        bullets: [
          "Consultas oraculares (como jogo de búzios e cartas), rituais, limpezas espirituais, aconselhamentos e trabalhos religiosos têm natureza espiritual, subjetiva e de fé. Os serviços contratados pela plataforma são obrigação de meio (realizar o ritual ou atendimento conforme a tradição da casa), nunca obrigação de resultado.",
          "Nem a plataforma nem as casas garantem a concretização de desejos, curas físicas ou emocionais, retorno amoroso, ganhos financeiros ou qualquer resultado material específico.",
          "Cada casa tem autonomia litúrgica, doutrinária e operacional sobre os seus rituais, preços e orientações. A plataforma não interfere nas práticas religiosas e não responde pela insatisfação do cliente com o teor das revelações ou com os efeitos espirituais percebidos, por decisões pessoais, financeiras, médicas ou jurídicas tomadas com base em aconselhamento espiritual, nem por materiais, insumos ou oferendas solicitados diretamente pela casa.",
          "Os serviços religiosos têm caráter de fé e acolhimento espiritual e não substituem diagnósticos, tratamentos ou acompanhamentos médicos, psicológicos, psiquiátricos ou jurídicos.",
          "Realizado o atendimento na data e no formato combinados, não cabe reembolso nem estorno baseado apenas na discordância do cliente quanto ao conteúdo da consulta ou na falta de um resultado material esperado. A plataforma só atua na análise de casos em que fique comprovada a não realização do serviço pago, irregularidade ou a ausência da casa. Por isso, a casa deve registrar o início e o fim do atendimento na plataforma, o que gera a confirmação enviada ao cliente.",
        ],
      },
      {
        heading: "Divulgação e ética dos anúncios",
        paragraphs: [
          "É proibido publicar anúncios, descrições de serviços ou comunicações com promessas absolutas, prazos determinantes ou garantia de resultados materiais, afetivos, financeiros ou de saúde (por exemplo, \"trago seu amor de volta em 3 dias, garantido\", \"cura definitiva\" ou \"ganho financeiro certo\"). Anúncios assim violam a legislação de defesa do consumidor e estão sujeitos a remoção imediata e à suspensão da conta.",
          "A divulgação deve refletir a natureza espiritual, de fé e de aconselhamento das práticas, apresentando o serviço como auxílio, caminho ou direcionamento espiritual, nunca como certeza absoluta.",
        ],
        bullets: [
          "Inadequado (proibido): \"Trabalho de amarração amorosa com resultado 100% garantido em até 7 dias.\"",
          "Adequado (recomendado): \"Trabalho espiritual voltado a auxiliar na harmonização afetiva, na abertura de caminhos no amor e no fortalecimento de vínculos, realizado conforme os fundamentos da nossa casa.\"",
        ],
      },
      {
        heading: "Moderação de conteúdo",
        paragraphs: [
          `A ${BRAND} pode revisar, pedir alterações ou ocultar perfis e serviços cujas descrições induzam o cliente a erro ou contrariem a transparência e o respeito religioso da plataforma.`,
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
