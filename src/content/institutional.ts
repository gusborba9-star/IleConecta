// Textos institucionais. Revisados e aprovados pelo advogado em 16/11/2026.
// O mesmo valor de brand.ts (que existe só para o rodapé não puxar este arquivo grande); tests/coalesce-fetch.test.mjs confere que são iguais.
export const BRAND = "Ilê Conecta";
export const REVIEW_PENDING = false;

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
        heading: "Reuniões por vídeo",
        bullets: [
          "A plataforma não grava as reuniões. Não grave, fotografe a tela nem capte o áudio de uma reunião sem o consentimento de todas as pessoas presentes.",
          "A casa que marca a reunião é responsável por avisar os participantes sobre o que será tratado e por conduzir o encontro com respeito.",
          "O link da sala é pessoal: não compartilhe o acesso com quem não foi convidado.",
          "A presença de menores de 18 anos em reunião ou consulta exige autorização e acompanhamento do responsável legal.",
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
          "Tarifas de Processamento de Pagamento: Nas transações realizadas entre CLIENTES e CASAS ESPIRITUAIS (serviços, consultas, rituais, trabalhos e mensalidades de membros), os custos e tarifas cobrados pelo processador de pagamentos (Stripe) serão arcados exclusivamente pela CASA ESPIRITUAL, descontados no momento do recebimento conforme as condições vigentes. Nas contratações realizadas pela CASA ESPIRITUAL diretamente junto ao Ilê Conecta (planos de assinatura, pacotes de créditos de IA, destaques, impulsionamentos e vagas extras de equipe), as tarifas do processador de pagamentos serão arcadas integralmente pela plataforma, inclusive em caso de reembolso dentro do prazo legal.",
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
      {
        heading: "7. Reuniões e consultas por vídeo",
        paragraphs: [
          "A plataforma é apenas o meio técnico de conexão: não participa, não modera ao vivo, não grava e não interfere no conteúdo religioso, espiritual ou pessoal tratado nas reuniões e consultas. A casa organizadora e os participantes respondem pela legalidade e pelo respeito do que é dito e praticado na sala.",
          "É proibido gravar, fotografar a tela, captar o áudio ou divulgar imagens e falas de uma reunião ou consulta sem a autorização de todos os participantes. A captação e a divulgação indevidas violam direitos de imagem e de intimidade e sujeitam quem as praticou à exclusão imediata da conta e à responsabilização civil e criminal perante as pessoas prejudicadas. A plataforma não oferece ferramenta de gravação.",
          "As consultas por vídeo individuais são permitidas apenas a maiores de 18 (dezoito) anos, ou a menores representados ou assistidos pelo responsável legal, que deve acompanhar o atendimento.",
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
          "Tarifas de Processamento de Pagamento: Nas transações realizadas entre CLIENTES e CASAS ESPIRITUAIS (serviços, consultas, rituais, trabalhos e mensalidades de membros), os custos e tarifas cobrados pelo processador de pagamentos (Stripe) serão arcados exclusivamente pela CASA ESPIRITUAL, descontados no momento do recebimento conforme as condições vigentes. Nas contratações realizadas pela CASA ESPIRITUAL diretamente junto ao Ilê Conecta (planos de assinatura, pacotes de créditos de IA, destaques, impulsionamentos e vagas extras de equipe), as tarifas do processador de pagamentos serão arcadas integralmente pela plataforma, inclusive em caso de reembolso dentro do prazo legal.",
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
          "Pacotes Avulsos de Créditos de IA: Os pacotes de créditos avulsos adquiridos pela CASA ESPIRITUAL possuem validade de 3 (três) meses contados da data de confirmação do pagamento; após esse prazo, eventuais créditos não utilizados expirarão automaticamente, sem direito a reembolso ou prorrogação. O consumo seguirá obrigatoriamente a seguinte ordem: primeiro será utilizada a franquia mensal incluída no plano vigente e, posteriormente, os pacotes avulsos, iniciando-se sempre pelo pacote com data de aquisição mais antiga. Em caso de pedido de reembolso dentro do prazo legal de 7 (sete) dias corridos, pacotes sem uso serão devolvidos integralmente e pacotes com uso parcial terão reembolso proporcional às respostas não utilizadas.",
          "Direito de arrependimento: conforme o art. 49 do Código de Defesa do Consumidor, o reembolso poderá ser solicitado em até 7 (sete) dias corridos, diretamente na seção Pedidos e validações, obedecendo às seguintes regras por modalidade:",
          "a) Planos e vagas extras: aplica-se exclusivamente à primeira contratação do plano ou da vaga extra (não se aplicando às renovações automáticas). Concluído o reembolso, a assinatura ou a vaga extra é imediatamente encerrada e, no caso do plano, a casa retorna ao plano Grátis, com os limites e as regras desse plano.",
          "b) Pacotes de créditos da assistente: aplica-se a cada compra avulsa. Se não houver uso dentro dos 7 dias, o valor é devolvido integralmente. Havendo uso parcial (considerando que a franquia mensal do plano é consumida antes dos pacotes avulsos), é devolvido o valor proporcional às respostas não utilizadas, ficando a tarifa do provedor de pagamento arcada pela plataforma.",
          "c) Destaques de casas e impulsionamentos (serviços, rituais ou publicações): como o serviço tem início imediato após o pagamento e é contado em blocos de 24 horas, o reembolso dentro dos 7 dias aplica-se exclusivamente aos blocos inteiros de 24 horas que ainda não tenham sido iniciados, pelo valor pago por dia, sem desconto de tarifa. O bloco de 24 horas em andamento segue ativo até o seu término, sem devolução proporcional, salvo se a casa excluir o conteúdo impulsionado, hipótese em que o bloco em andamento é encerrado imediatamente, sem direito a reembolso. Caso nenhum bloco do pacote tenha iniciado, a devolução é integral.",
          "d) Contas reutilizadas e uso abusivo: considera-se conta reutilizada todo cadastro novo que utilize e-mail, CPF/CNPJ, dispositivo ou dados vinculados a outra conta anterior, esteja ela encerrada ou ativa. Benefícios exclusivos para novos usuários (como períodos de teste gratuito, créditos iniciais ou descontos de primeira contratação) são concedidos uma única vez e não se aplicam a contas reutilizadas. O reembolso de 7 dias na contratação de plano também não é concedido novamente quando outra conta vinculada, encerrada ou ativa, já o tenha utilizado. É permitida apenas 1 (uma) conta por Casa Espiritual. A criação de múltiplas contas ou a realização sucessiva de contratações e pedidos de reembolso caracteriza fraude comercial e abuso de direito, autorizando o Ilê Conecta a suspender, inclusive de forma definitiva, a conta, o dispositivo e os dados vinculados, sem obrigação de detalhar os critérios técnicos de detecção. A suspensão pode ser contestada pelo chamado \"Acesso à conta\", e cada caso é analisado pela administração. Se a Casa mudou de responsável, a gestão da conta existente pode ser regularizada pelo suporte, sem criar uma conta nova. Para proteger a estabilidade e a segurança da plataforma, o sistema poderá aplicar limites temporários de tentativas de cadastro ou acesso originadas de uma mesma rede.",
          "e) Destaque e impulsionamento: o destaque posiciona o perfil da casa com prioridade nas buscas, no feed e no bloco \"Casas em destaque\" da tela inicial, dentro do alcance contratado (cidade, estado ou país). O impulsionamento amplia a entrega de um serviço, ritual ou publicação do feed para mais usuários. O valor é cobrado por dia, conforme a tabela vigente, e a quantidade de casas em destaque simultaneamente em cada alcance é limitada.",
          "f) Ao contratar, a casa marca a autorização expressa de início imediato. O serviço começa na confirmação do pagamento, e cada dia é contado em blocos de 24 horas a partir desse momento; o primeiro dia já conta como iniciado. Nova contratação do mesmo item e alcance soma os dias ao final do período em curso.",
          "g) Dentro dos 7 dias do pagamento, a casa pode pedir o reembolso dos dias que ainda não começaram, pelo valor efetivamente pago por dia, sem desconto de tarifa. O dia em andamento continua até o fim do seu bloco de 24 horas, salvo se a casa excluir o conteúdo impulsionado, hipótese em que o bloco em andamento é encerrado imediatamente, sem direito a reembolso. Se nenhum dia tiver começado, o valor é devolvido integralmente. Havendo suspensão da conta por falta de pagamento, o prazo contratado fica pausado e volta a correr quando a conta for regularizada.",
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
        heading: "Métricas de desempenho e conversões atribuídas",
        paragraphs: [
          "Os relatórios de destaque e impulsionamento mostram visualizações, cliques e conversões atribuídas. Conversão atribuída é qualquer conversa, pedido ou reserva iniciada com a Casa em até 7 dias depois de o anúncio ser aberto no mesmo aparelho.",
          "A métrica é estatística e não prova que o anúncio foi a causa exclusiva do contato. O número de aparelhos novos é uma estimativa por aparelho e pode representar mais de uma pessoa. Nenhum relatório identifica clientes.",
          "Os indicadores de visitas e de interesse na página da Casa (visitas, pessoas que viram a página, pessoas que abriram um serviço ou ritual e compartilhamentos) são estatísticas agregadas e anônimas. A Casa recebe apenas totais e é proibida qualquer tentativa de identificar visitantes individuais a partir desses números. Os números são estimativas técnicas: a mesma pessoa que acessa por aparelhos ou navegadores diferentes pode ser contada mais de uma vez. A plataforma não garante a exatidão absoluta dessas métricas, que servem apenas como apoio informativo de desempenho.",
        ],
      },
      {
        heading: "Distribuição e equilíbrio dos anúncios",
        paragraphs: [
          "Destaques e impulsionamentos são exibidos por sorteio e rodízio automáticos dentro da região e da modalidade contratadas, sem garantia de número de visualizações. A plataforma acompanha internamente a exposição média diária para manter o equilíbrio técnico e a isonomia entre as Casas.",
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
        heading: "Momentos e trilhas sonoras",
        paragraphs: [
          "Dentro dos Momentos, o Ilê Conecta disponibiliza uma biblioteca de áudios composta por faixas exclusivas da plataforma e por faixas sob licenças abertas (como CC0 e CC BY). As faixas sob licenças abertas mantêm suas respectivas licenças originais, e os dados de autoria e os links constam na página Créditos de Áudio.",
          "Quanto às faixas exclusivas da plataforma, é vedada sua extração, download ou utilização fora do ambiente do aplicativo. A casa escolhe a música apenas para acompanhar o próprio Momento.",
          "O Ilê Conecta poderá retirar ou substituir qualquer faixa da biblioteca a qualquer momento, sem aviso prévio.",
        ],
      },
      {
        heading: "Imagem de terceiros e de crianças e adolescentes",
        paragraphs: [
          "A casa declara possuir autorização de uso de imagem das pessoas que aparecerem em suas publicações e Momentos (fotos e vídeos de giras, festas, atendimentos e outros eventos), e responde por essas imagens.",
          "É proibido expor crianças e adolescentes sem o consentimento específico e destacado dos pais ou responsáveis legais (Estatuto da Criança e do Adolescente e LGPD, art. 14).",
          `Quem se reconhecer em uma imagem, ou for responsável por um menor retratado, pode pedir a retirada pelo botão de denúncia do Momento ou pelo suporte. A ${BRAND} também pode ocultar ou remover imediatamente, como medida de proteção, qualquer conteúdo em que pareça haver criança ou adolescente sem autorização, e avisa a casa em seguida.`,
        ],
      },
      {
        heading: "Vedações e inexistência de garantia de resultado",
        paragraphs: [
          "É proibido prometer, divulgar ou sugerir garantia de resultado específico, prazos certos para desfechos de vida privada, saúde, reconciliação ou ganhos financeiros. Os serviços têm natureza espiritual e de convicção pessoal. A casa responde por qualquer publicidade que induza o cliente a erro.",
        ],
      },
      {
        heading: "Reuniões e consultas por vídeo",
        paragraphs: [
          `A casa é a única responsável pela condução das reuniões que marca e das consultas que realiza por vídeo, pelo cumprimento do que foi contratado e pelo respeito aos direitos dos participantes. A ${BRAND} atua apenas como meio técnico de conexão: não participa, não modera ao vivo, não grava e não interfere no conteúdo religioso, espiritual ou pessoal tratado na sala.`,
          `A casa responde pelos atos que praticar ou permitir dentro da sala e se compromete a isentar a ${BRAND} e a ressarci-la se ela for acionada por esses atos, na forma da lei.`,
          "Nas reuniões abertas da casa, se participarem menores de 18 (dezoito) anos, cabe exclusivamente à casa garantir a autorização expressa e o acompanhamento dos pais ou responsáveis legais. Consultas individuais por vídeo são permitidas apenas a maiores de 18 (dezoito) anos, ou a menores representados ou assistidos pelo responsável legal.",
          "A casa não pode gravar nem divulgar a reunião ou a consulta sem a autorização de todos os participantes.",
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
          "Registros de acesso: endereço IP, data e hora em que a sua conta acessa a plataforma. Guardamos por 6 meses, com exclusão automática depois desse prazo, com base no nosso legítimo interesse de segurança e prevenção a fraudes (LGPD, art. 7º, IX), e também para cumprir as obrigações legais aplicáveis aos provedores de aplicações de internet. Usamos esses registros, junto com o código técnico do dispositivo, para prevenir fraudes, abusos e a criação de várias contas para repetir benefícios. O IP, sozinho, nunca é motivo de bloqueio, porque várias pessoas podem compartilhar a mesma rede.",
          "Registros de segurança e dispositivos: para proteger a sua conta contra acessos não autorizados e prevenir fraudes, guardamos um identificador técnico anônimo do dispositivo (um código gerado sem dados do seu aparelho), a identificação genérica do sistema e do navegador, e a data e hora do acesso. Esses registros ficam por até 12 meses sem uso do dispositivo, e os alertas de segurança enviados a você ficam por 24 meses, com base no nosso legítimo interesse de segurança (LGPD, art. 7º, IX) e no dever de adotar medidas de segurança (LGPD, art. 46).",
          "Cartão de pagamento e limite de cadastros: quando você paga com cartão ou cadastra um cartão para a cobrança automática, o provedor de pagamento nos devolve uma impressão técnica do cartão (um código que identifica o cartão sem revelar o número). Guardamos somente um código irreversível dessa impressão, nunca o número, a validade ou o nome do titular, por 24 meses desde o último uso, com base no nosso legítimo interesse de prevenção a fraudes (LGPD, art. 7º, IX) e no exercício regular de direitos, para identificar contas ligadas ao mesmo cartão e apoiar a análise humana contra fraudes e repetição abusiva de benefícios. Esse código, sozinho, nunca bloqueia uma contratação nem uma conta. Para limitar cadastros em massa e proteger a estabilidade do sistema (com base em nosso legítimo interesse de segurança, LGPD, art. 7º, IX), guardamos por no máximo 3 dias um código irreversível da rede usada em cada tentativa de cadastro.",
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
          "Para fornecer relatórios transparentes de desempenho às casas e evitar contagens duplicadas, registramos temporariamente a interação (aparição ou clique) em conteúdos impulsionados ou em destaque. Esse registro técnico é usado apenas para medir a entrega do serviço contratado pela casa (execução dos Termos de Uso que você aceita ao entrar na plataforma, LGPD, art. 7º, V, o que viabiliza a busca, as conexões com as casas e a auditoria técnica antifraude e de entrega do sistema), sem perfilamento individual e sem uso de dados sobre crença ou religião.",
          "Os registros individuais de acesso são eliminados em até 24 horas, permanecendo apenas os totais diários sem identificação de usuários.",
        ],
      },
      {
        heading: "Visitas e interesse nas páginas das casas",
        paragraphs: [
          "Para que cada casa saiba quantas pessoas viram a sua página, abriram um serviço ou ritual e compartilharam a página, o Ilê Conecta conta essas ações. Guardamos apenas totais por casa e por dia (por exemplo, \"80 pessoas viram a página hoje\"). A casa nunca vê quem visitou.",
          "Para não contar a mesma pessoa mais de uma vez no mesmo dia, geramos um código técnico a partir da sua conta (ou, se você não tem conta, de um código aleatório guardado no seu aparelho), misturado ao dia, à casa e a um segredo da plataforma. Esse código não permite identificar você nem acompanhar você de um dia para o outro ou de uma casa para outra, e é apagado ao fim do próprio dia (horário de Brasília). Os totais diários ficam por 13 meses.",
          "Não contamos visitas da própria casa nem da equipe. Se o seu navegador envia o sinal \"não rastrear\" (Do Not Track) ou o Controle Global de Privacidade, nenhuma contagem é feita. Base legal: legítimo interesse (LGPD, art. 7º, IX), para oferecer às casas indicadores do próprio desempenho, sem perfil individual e sem compartilhar esses dados com terceiros.",
        ],
      },
      {
        heading: "Contagem por aparelho e limite de repetição",
        paragraphs: [
          "Para estimar quantos aparelhos diferentes viram um anúncio e evitar repeti-lo em excesso, o aplicativo guarda no próprio aparelho uma lista local dos anúncios já exibidos. Essa lista não identifica você, é limpa periodicamente (cerca de 30 dias) e pode ser apagada a qualquer momento ao limpar os dados do navegador. Só enviamos ao servidor o aviso de que um anúncio apareceu pela primeira vez naquele aparelho, sem associá-lo a um perfil.",
        ],
      },
      {
        heading: "Conversões atribuídas aos anúncios",
        paragraphs: [
          "Quando você abre um anúncio, o aplicativo guarda no aparelho um código técnico temporário, válido por 7 dias, sem nenhum dado pessoal. Se, nesse prazo e no mesmo aparelho, você iniciar uma conversa, um pedido ou uma reserva com a casa anunciante, registramos apenas a ligação entre o anúncio, o tipo de ação, o identificador da ação e a data.",
          "Esse registro serve para informar à casa, de forma agregada, o resultado do serviço contratado. Ele é mantido por 13 (treze) meses, para análise anual de desempenho, e depois excluído automaticamente; também é excluído quando a conversa, o pedido ou a reserva de origem deixam de existir, para que nunca sirva de atalho para identificar alguém.",
        ],
      },
      {
        heading: "Busca pela localização atual",
        paragraphs: [
          "Se você escolher usar a sua localização atual, o navegador ou o aparelho pede a sua autorização. As coordenadas do GPS são convertidas em cidade e estado no próprio aparelho; elas nunca são enviadas nem guardadas por nós. Somente a cidade e o estado são usados na consulta (por exemplo, para mostrar casas e anúncios da região).",
          "A cidade e o estado do momento ficam guardados por até 7 dias apenas no seu aparelho, e você pode desfazer a escolha quando quiser.",
        ],
      },
      {
        heading: "Registros técnicos da infraestrutura",
        paragraphs: [
          "Os servidores de hospedagem registram temporariamente dados técnicos básicos de conexão (como endereço IP e os parâmetros de cidade/estado da busca) apenas para segurança, estabilidade e cumprimento de obrigação legal, sendo descartados automaticamente após o prazo técnico.",
        ],
      },
      {
        heading: "Momentos (publicações de 24 horas)",
        paragraphs: [
          "As fotos e os vídeos que as casas publicam em Momentos ficam visíveis por 24 (vinte e quatro) horas, e os arquivos são eliminados definitivamente dos servidores em até 48 (quarenta e oito) horas após a publicação. As curtidas e os comentários são excluídos em até 2 (dois) dias após a expiração do Momento.",
          "A casa vê apenas o número total de visualizações, sem identificar quem viu, e o nome de quem curtiu ou comentou. Se um Momento for denunciado, os registros correspondentes podem ser mantidos por até 90 (noventa) dias após a conclusão da análise, para auditoria e exercício regular de direitos.",
          "A base legal é a execução do contrato (exibir a publicação, as curtidas, os comentários e as métricas contratadas) e, para o conteúdo denunciado, o exercício regular de direitos.",
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
        paragraphs: [
          "Prazos de Retenção e Eliminação de Dados: O Ilê Conecta armazena os dados pessoais apenas pelo tempo necessário para cumprir as finalidades para as quais foram coletados ou para atender a exigências legais e regulatórias, observando os seguintes prazos:",
        ],
        bullets: [
          "Registros de acesso à aplicação (logs de IP, data e hora): 6 (seis) meses, com base no legítimo interesse de segurança e prevenção a fraudes e, quando aplicável, no cumprimento do art. 15 do Marco Civil da Internet;",
          "Registros financeiros, pagamentos, estornos e documentos fiscais: 5 (cinco) anos, para cumprimento de obrigações fiscais e contábeis;",
          "Reuniões por vídeo: registro de uso e de ciência do aviso, 12 (doze) meses; agendamento de reunião da casa sem vínculo financeiro, 12 (doze) meses; agendamento de consulta por vídeo ligada a pedido pago, 5 (cinco) anos. A plataforma não grava o áudio nem o vídeo;",
          "Logs de aceite dos Termos e e-mails vinculados a cada conta (os atuais, os anteriores e os de contas excluídas): até 5 (cinco) anos, armazenados em base restrita e auditada, para exercício regular de direitos e prevenção a fraudes ou uso abusivo de benefícios;",
          "Código irreversível da impressão do cartão de pagamento: 24 (vinte e quatro) meses desde o último uso, para prevenção a fraudes e uso abusivo de benefícios; e código irreversível da rede de cada tentativa de cadastro (limite de cadastros por rede): até 3 (três) dias;",
          "Registros de segurança e dispositivos (código anônimo do dispositivo, sistema, navegador, data e hora): 12 (doze) meses sem uso; alertas de segurança enviados à conta: 24 (vinte e quatro) meses, para segurança da conta e prevenção a fraudes;",
          "Chamados de suporte, denúncias e respectivas mensagens: 24 (vinte e quatro) meses após o encerramento do chamado, para auditoria de segurança e resolução de eventuais disputas;",
          "Histórico de atendimentos realizados pela casa e auditoria de ações da equipe: 12 (doze) meses, para controle operacional e transparência da gestão da conta;",
          "Mensagens excluídas pelo usuário: mantidas em arquivo restrito por 30 (trinta) dias por segurança e eliminadas definitivamente após esse período;",
          "Conversas com a assistente de suporte: 3 (três) dias, sendo descartadas automaticamente após esse prazo;",
          "Registros técnicos de erro do aplicativo (sem endereço IP, e-mail ou identificador da conta): 30 (trinta) dias, sendo descartados automaticamente;",
          "Momentos: arquivo eliminado em até 48 (quarenta e oito) horas após a publicação; curtidas e comentários em até 2 (dois) dias após a expiração; registros de Momento denunciado, até 90 (noventa) dias após a análise;",
          "Interações brutas de visualização e clique em impulsionamentos: 24 (vinte e quatro) horas, mantendo-se posteriormente apenas os totais diários consolidados e anônimos.",
          "Conversões atribuídas a anúncios (ligação entre anúncio, tipo de ação, identificador e data, sem dados pessoais): 13 (treze) meses, com exclusão automática, ou antes, se a conversa, o pedido ou a reserva de origem forem excluídos;",
          "Lista local de anúncios já exibidos e cidade/estado da localização atual: apenas no seu aparelho, por cerca de 30 dias e 7 dias, respectivamente.",
        ],
      },
      {
        paragraphs: [
          "Após o encerramento definitivo da conta (concluído o prazo de 7 dias da solicitação), o perfil público, fotos, publicações e dados de cartão são apagados ou anonimizados, permanecendo retidos exclusivamente os registros sujeitos aos prazos legais acima.",
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
        heading: "Reuniões por vídeo",
        paragraphs: [
          `As reuniões por vídeo (reuniões de casas com seus membros e consultas por vídeo ligadas a um pedido) são realizadas por provedores especializados de infraestrutura de videoconferência contratados pela ${BRAND}, que atuam como operadores (atualmente, o Daily e a LiveKit). Ao entrar na sala, o seu áudio e o seu vídeo são transmitidos em tempo real pelo provedor aos demais participantes, junto com o seu nome de exibição e o identificador da sua conta. O provedor também pode tratar dados técnicos de conexão, como endereço IP e informações do aparelho, para fazer a chamada funcionar e proteger o serviço.`,
          `A ${BRAND} não grava, não armazena e não tem acesso ao conteúdo de áudio ou vídeo das chamadas. Os provedores de videoconferência tratam o fluxo em tempo real e mantêm apenas registros técnicos operacionais temporários, estritamente necessários para a qualidade e a segurança da transmissão.`,
          "Guardamos apenas o registro de uso (quem entrou, o horário de entrada e de saída e os minutos consumidos), que serve para controlar o limite de minutos do plano e comprovar a prestação do serviço, e o registro de que você leu o aviso da sala antes de entrar. O registro de uso é eliminado após 12 (doze) meses. O registro de agendamento (título, data, horário, casa e pessoas convidadas) é eliminado após 12 (doze) meses, no caso de reuniões da casa sem vínculo financeiro, e após 5 (cinco) anos, no caso de consultas por vídeo ligadas a um pedido pago, ou antes disso se a conta for excluída, ressalvadas as obrigações legais.",
          "Cada participante é responsável por não gravar nem divulgar a reunião sem o consentimento de todos. Em consultas por vídeo, a conversa pode envolver dados pessoais sensíveis (como convicção religiosa); por isso, compartilhe apenas o que for necessário. A base legal é a execução do contrato do atendimento e, para os dados sensíveis, o seu consentimento.",
          "A transferência internacional de dados nas reuniões por vídeo ocorre de forma estritamente necessária para a execução do serviço de videoconferência solicitado por você (LGPD, art. 33, IX, em conjunto com o art. 7º, V), apoiada nos compromissos de proteção de dados e de segurança assumidos pelos provedores (DPA).",
        ],
      },
      {
        heading: "Transferência internacional de dados",
        paragraphs: [
          `Para viabilizar a operação tecnológica da plataforma, a ${BRAND} utiliza serviços de provedores de infraestrutura em nuvem, de processamento de pagamentos (como o Stripe) e de inteligência artificial, cujos servidores podem estar localizados fora do Brasil.`,
          "Nesses casos, a transferência internacional de dados é necessária para a execução do serviço contratado (LGPD, art. 33, IX, combinado com o art. 7º, V) e ocorre por meio de provedores globais que adotam garantias contratuais e padrões internacionais de segurança da informação, em conformidade com o art. 33 da LGPD e com a regulamentação da ANPD.",
        ],
      },
      {
        heading: "Registros técnicos e diagnóstico de erros",
        paragraphs: [
          "Para monitorar a estabilidade e corrigir falhas, o sistema registra eventos técnicos de erro de funcionamento por até 30 (trinta) dias. Esses registros não carregam endereço IP, e-mail ou identificador da conta, e são descartados automaticamente após esse período.",
        ],
      },
      {
        heading: "Seus direitos",
        paragraphs: [
          "Você pode pedir acesso, correção, exclusão dos seus dados, entre outros direitos previstos em lei. Para isso, fale com o suporte do aplicativo ou use o e-mail de atendimento indicado no início desta página, quando houver.",
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
