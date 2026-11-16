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
          "4.5. Propostas de agendamento pelo chat: a casa poderá enviar diretamente pelo chat da plataforma uma proposta contendo serviço, data e horário sugeridos. A proposta tem validade de 24 (vinte e quatro) horas e não reserva nem bloqueia a agenda até a efetiva confirmação do pagamento pelo cliente. Caso outro cliente reserve e pague aquele mesmo horário antes da conclusão da proposta, o sistema notifica automaticamente o cliente sobre a indisponibilidade. Concluído o pagamento com o horário disponível, aplicam-se as mesmas regras gerais de cancelamento e reembolso integral antes do início do atendimento.",
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
          "Propostas de agendamento pelo chat: a casa poderá enviar diretamente pelo chat da plataforma uma proposta contendo serviço, data e horário sugeridos. A proposta tem validade de 24 (vinte e quatro) horas e não reserva nem bloqueia a agenda até a efetiva confirmação do pagamento pelo cliente. Caso outro cliente reserve e pague aquele mesmo horário antes da conclusão da proposta, o sistema notifica automaticamente o cliente sobre a indisponibilidade. Concluído o pagamento com o horário disponível, aplicam-se as mesmas regras gerais de cancelamento e reembolso integral antes do início do atendimento.",
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
          "Cancelamento: a casa cancela a qualquer momento no painel e mantém o acesso aos recursos do plano até o último dia do período já pago. Não há reembolso proporcional de dias não usados, ressalvado o direito de arrependimento descrito a seguir.",
          "Troca de plano: a casa pode assinar um plano pago, subir de plano ou descer de plano em Planos. Na assinatura, a mensalidade cheia é paga na hora e o vencimento passa a ser o dia do pagamento. No upgrade, os recursos novos são liberados na hora e a casa paga só a diferença proporcional aos dias que faltam no ciclo, sem mudar o vencimento (indisponível nos 7 dias do primeiro pagamento e enquanto a fatura da próxima renovação já estiver gerada). A descida de plano, inclusive a volta ao plano Grátis, vale na próxima renovação, sem devolução de valores já pagos.",
          "Desconto de pontualidade no Pix: a plataforma poderá oferecer desconto para pagamento antecipado via Pix incidente exclusivamente sobre a mensalidade base do plano (não se aplicando a vagas extras, pacotes de créditos ou impulsionamentos), conforme o percentual e o prazo limite informados na própria fatura. O desconto não se aplica aos pagamentos realizados por cartão de crédito nem após o vencimento do prazo estipulado, podendo ser alterado ou encerrado para faturas futuras mediante aviso prévio no aplicativo.",
          "Vagas extras de equipe: as vagas extras de equipe são contratadas por ciclo mensal, conforme o valor correspondente ao plano vigente da casa, e são liberadas imediatamente após a confirmação do pagamento. No mês da primeira contratação, o valor é cobrado proporcionalmente aos dias restantes do ciclo atual. A solicitação de redução de vagas fica agendada para surtir efeito ao final do ciclo já pago, sem reembolso proporcional do período em curso. O direito de arrependimento de 7 (sete) dias corridos aplica-se exclusivamente à primeira contratação da vaga extra, implicando seu cancelamento imediato após a conclusão do estorno. Em caso de contestação bancária (chargeback) ou estorno indevido, a plataforma poderá suspender imediatamente a respectiva vaga até a regularização.",
          "Alterações nas condições de cobrança e bloqueio: eventuais alterações nas condições de cobrança ou nos prazos de bloqueio previstos nestes Termos são comunicadas com antecedência mínima de 30 (trinta) dias, por meio de notificação registrada na plataforma, passando a vigorar somente após o término desse prazo. Caso a casa não concorde com as novas condições, pode solicitar o cancelamento de sua assinatura sem ônus antes da entrada em vigor das alterações.",
          "Plano Grátis: no plano Grátis, os serviços e rituais devem ser comercializados exclusivamente por meio da plataforma, com os meios de pagamento por ela oferecidos, sendo obrigatório conectar a conta de recebimento antes de publicar itens com valor. A tentativa de negociar, divulgar contatos externos ou receber pagamentos por fora da plataforma constitui infração grave, sujeita à avaliação da administração, que notifica a casa e pode aplicar advertência, suspensão ou exclusão da conta. A casa que deseja utilizar outros meios de pagamento pode contratar um plano pago. O plano Grátis tem limites de serviços ativos, rituais ativos e publicações por mês, informados na página de Planos.",
          "Direito de arrependimento: conforme o art. 49 do Código de Defesa do Consumidor, o reembolso pode ser solicitado em até 7 (sete) dias corridos, diretamente na seção Pedidos e validações, e vale exclusivamente para a primeira contratação do plano, para a primeira contratação de cada vaga extra de equipe e para cada compra avulsa de pacote de créditos (não vale para as renovações automáticas do plano nem para as renovações mensais das vagas extras).",
          "a) Quando o reembolso do plano é concluído, a assinatura é imediatamente encerrada e a casa retorna ao plano Grátis, com os limites e as regras desse plano.",
          "b) Pacote de créditos da assistente sem uso dentro dos 7 dias é devolvido integralmente.",
          "c) Havendo uso parcial dos créditos dentro dos 7 dias (a franquia mensal do plano é consumida antes dos pacotes avulsos), devolve-se o valor proporcional às respostas ainda não utilizadas. A tarifa do provedor de pagamento fica por conta da plataforma.",
          "d) Para prevenção a fraudes e ao uso abusivo de benefícios, contas criadas com endereço de e-mail vinculado a uma conta anteriormente excluída que já tenha utilizado o reembolso de 7 dias não contam com nova concessão desse benefício na contratação do plano.",
          "e) Destaque e impulsionamento: o destaque posiciona o perfil da casa com prioridade nas buscas, no feed e no bloco \"Casas em destaque\" da tela inicial, dentro do alcance contratado (cidade, estado ou país). O impulsionamento amplia a entrega de um serviço, ritual ou publicação do feed para mais usuários. O valor é cobrado por dia, conforme a tabela vigente, e a quantidade de casas em destaque simultaneamente em cada alcance é limitada.",
          "f) Ao contratar, a casa marca a autorização expressa de início imediato. O serviço começa na confirmação do pagamento, e cada dia é contado em blocos de 24 horas a partir desse momento; o primeiro dia já conta como iniciado. Nova contratação do mesmo item e alcance soma os dias ao final do período em curso.",
          "g) Dentro dos 7 dias do pagamento, a casa pode pedir o reembolso dos dias que ainda não começaram, pelo valor efetivamente pago por dia, sem desconto de tarifa. O dia em andamento continua até o fim do seu bloco de 24 horas. Se nenhum dia tiver começado, o valor é devolvido integralmente. Havendo suspensão da conta por falta de pagamento, o prazo contratado fica pausado e volta a correr quando a conta for regularizada.",
          "Segurança e armazenamento de dados de pagamento: para viabilizar cobranças recorrentes e transações, os dados do cartão são processados de forma criptografada (tokenizada) exclusivamente por instituições de pagamento parceiras certificadas (padrão PCI-DSS). A plataforma não tem acesso nem armazena o código de segurança (CVV) do cartão em seus servidores. Mesmo após a desvinculação do cartão ou a exclusão da conta, os parceiros de pagamento (como o Stripe) podem reter registros históricos das transações já processadas pelo prazo exigido pela legislação financeira e pelas normas do setor de cartões.",
        ],
      },
      {
        heading: "Exclusão da conta e prazo de retenção legal",
        paragraphs: [
          "Se a casa pedir o encerramento pela opção \"Excluir minha conta\", o pedido fica agendado por 7 (sete) dias corridos, período em que o responsável pode desistir e cancelar a solicitação. Havendo fatura vencida, assinatura ativa, pagamento em processamento ou reembolso em andamento, o pedido é bloqueado e a tela informa os motivos para regularização. Concluído o prazo sem desistência, os dados públicos, as mensagens e o cartão cadastrado são apagados ou anonimizados, mantendo-se em base restrita e auditada (acessível apenas à administração), pelo prazo legal de até 5 (cinco) anos, os registros financeiros, fiscais, os registros de aceite e o e-mail do titular, exclusivamente para cumprimento de obrigações legais, exercício regular de direitos e prevenção a fraudes ou ao uso abusivo de benefícios da plataforma, conforme autorizado pela Lei Geral de Proteção de Dados (LGPD).",
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
        heading: "Moderação, advertências e contestação",
        paragraphs: [
          `A ${BRAND} utiliza ferramentas automatizadas e análise humana para identificar conteúdos que violem estes Termos, em especial promessas de resultado garantido e a divulgação de contatos externos no Plano Grátis. Identificada a infração, a casa será notificada por advertência pelo aplicativo e terá o prazo de até 72 (setenta e duas) horas para corrigir o conteúdo. Para conteúdos publicados antes da regra, o prazo de correção é de 15 (quinze) dias.`,
          "Não havendo a correção no prazo, o conteúdo infringente poderá ser ocultado ou suspenso, sem prejuízo dos demais conteúdos e serviços da casa, até que seja ajustado. A casa que discordar da medida poderá contestá-la em até 7 (sete) dias corridos, pelo aplicativo ou pelo Suporte, e a contestação será analisada pela administração. A moderação incide apenas sobre conteúdos públicos da casa, nunca sobre as conversas do chat.",
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
          "Documento do responsável pela casa (CPF ou CNPJ), informado ao contratar plano ou recursos pagos.",
        ],
      },
      {
        heading: "Para que usamos",
        bullets: [
          "Criar e manter a sua conta e a página da casa.",
          "Permitir o contato entre clientes e casas.",
          "Dar segurança à plataforma e evitar fraudes.",
          "Medir, de forma consolidada, o desempenho de destaques e impulsionamentos (veja abaixo).",
        ],
      },
      {
        heading: "Métricas de visualização e impulsionamento",
        paragraphs: [
          "Para fornecer relatórios transparentes de desempenho às casas e evitar contagens duplicadas, registramos temporariamente a interação (aparição ou clique) de cada visitante em conteúdos impulsionados ou em destaque. Esse registro técnico bruto é tratado com base no legítimo interesse (LGPD, art. 7º, IX), é eliminado automaticamente a cada 24 horas e deixa apenas totais consolidados por dia, sem identificação do visitante nos relatórios exibidos às casas.",
        ],
      },
      {
        heading: "Dados sensíveis (convicção religiosa)",
        paragraphs: [
          "Ao contratar, você pode informar dados que revelam a sua convicção religiosa ou necessidades espirituais. São dados sensíveis, tratados com base no seu consentimento específico e destacado (LGPD, art. 11), somente para: permitir o agendamento e a execução do serviço; viabilizar a comunicação com a casa escolhida; e permitir a cobrança e o suporte. Eles não são compartilhados com terceiros alheios ao serviço nem usados para outras finalidades.",
        ],
      },
      {
        heading: "CPF ou CNPJ do titular da casa",
        paragraphs: [
          "Coletamos o CPF ou CNPJ do titular responsável pela casa espiritual no momento da contratação de planos ou recursos pagos para processar cobranças, prevenir fraudes e cumprir obrigações fiscais e regulatórias (com fundamento nas bases legais de execução de contrato e cumprimento de obrigação legal, nos termos da LGPD). O documento é armazenado de forma criptografada, com acesso interno restrito e auditado, não sendo exibido por completo nas telas da plataforma. Esse dado poderá ser compartilhado com nossos parceiros processadores de pagamento, com autoridades fiscais e, em caso de inadimplência vencida e não regularizada, com empresas de cobrança ou cadastros de proteção ao crédito. Os registros permanecerão armazenados pelo prazo legal de até 5 (cinco) anos para atendimento às normas fiscais e exercício regular de direitos, sendo posteriormente eliminados ou anonimizados.",
        ],
      },
      {
        heading: "Quanto tempo guardamos",
        bullets: [
          "Registros de acesso: por no mínimo 6 meses (Marco Civil da Internet, Lei nº 12.965/2014, art. 15).",
          "Registros de pagamentos e transações: por 5 anos, para obrigações fiscais e eventual defesa em processos.",
          "Se você pedir a exclusão, apagamos os dados da visualização ativa e mantemos, em sigilo, apenas o que a lei exige guardar.",
          "Contas excluídas: por até 5 anos, mantemos em base restrita, acessível apenas à administração, o e-mail do titular, os registros financeiros e fiscais e os registros de aceite, para cumprir obrigações legais, exercer direitos e prevenir fraudes e uso abusivo de benefícios (por exemplo, o reembolso de 7 dias já utilizado em conta anterior com o mesmo e-mail).",
          "Cartões: ao excluir a conta, o cartão cadastrado é desvinculado. Os parceiros de pagamento (como o Stripe) podem reter registros históricos das transações pelo prazo exigido pela legislação financeira e pelas normas do setor de cartões.",
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
    slug: "novidades-seguranca",
    title: "Novidades de segurança e transparência",
    summary: "Atendimento dentro da plataforma e comunicação ética, com período de adaptação de 30 dias.",
    sections: [
      {
        paragraphs: [
          `Estamos fortalecendo a segurança e a transparência no ${BRAND} para proteger as casas e quem busca atendimento. Veja o que muda:`,
        ],
      },
      {
        heading: "Atendimento dentro da plataforma no Plano Grátis",
        paragraphs: [
          "No Plano Grátis, o atendimento e a venda acontecem dentro da plataforma. Não é permitido divulgar telefone, link, e-mail ou arroba de rede social nos textos públicos da casa (nome, apresentação, serviços, rituais e publicações). Use o chat da plataforma para atender seus clientes. As conversas do chat não são verificadas por essa regra.",
        ],
      },
      {
        heading: "Comunicação ética, sem promessas garantidas",
        paragraphs: [
          "Os serviços têm natureza espiritual e de convicção pessoal. Por isso, não são permitidas promessas ou garantias de resultado, nem prazos certos para desfechos da vida pessoal, saúde, reconciliação ou ganhos financeiros. Descreva o trabalho pelo que ele é: a natureza espiritual, os fundamentos da casa e o acolhimento oferecido.",
        ],
      },
      {
        heading: "Período de adaptação de 30 dias",
        paragraphs: [
          "Nos primeiros 30 dias, o objetivo é educativo. Se identificarmos algum trecho a ajustar, a administração envia uma orientação, sem penalidade. Depois do período de adaptação, a casa passa a receber uma advertência com prazo de 72 horas para o ajuste. Sem o ajuste no prazo, apenas aquele anúncio fica oculto até a correção; o restante da casa continua funcionando. Você pode contestar em até 7 dias corridos.",
        ],
      },
      {
        heading: "Onde acompanhar",
        paragraphs: ["Orientações e avisos aparecem em Avisos de moderação, na sua conta, e também como notificação. Dúvidas? Fale com o Suporte."],
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
