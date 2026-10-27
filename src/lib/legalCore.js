// Textos de aceite versionados. Rascunho: precisa de revisão jurídica antes de os pagamentos serem ligados.
// Ao mudar qualquer texto, mude também LEGAL_VERSION: cada aceite do usuário guarda a versão que ele viu.
export const LEGAL_VERSION = "2026-10-rascunho-1";

export const CONSENT_DOCS = {
  checkout_ritual: {
    text:
      "Li e concordo com os Termos de Uso e a Política de Privacidade. Compreendo que o Ilê Conecta atua exclusivamente como plataforma intermediária entre clientes e casas espirituais, e que o processamento financeiro é feito por instituição de pagamento parceira. Sei que posso cancelar com reembolso integral a qualquer momento antes do início do ritual. A partir do início do evento ou da transmissão, o serviço passa a ser considerado em fruição e deixa de existir o cancelamento sem motivo; o reembolso só é possível se a casa não realizar o ritual, se o dirigente estiver ausente ou se houver cobrança indevida, e não por insatisfação pessoal com resultados de ordem espiritual.",
    links: ["termos-do-cliente", "privacidade-lgpd", "eventos-e-taxas"],
  },
  checkout_servico: {
    text:
      "Li e concordo com os Termos de Uso e a Política de Privacidade. Compreendo que o Ilê Conecta atua como plataforma intermediária de aproximação e agendamento. Posso cancelar e receber reembolso integral até o momento em que a casa iniciar o trabalho, o que será registrado na plataforma e avisado a mim. Depois do início, o reembolso só é possível se o trabalho não for executado, se houver erro de cobrança ou se o entregue for diferente do ofertado, e não por frustração de expectativa quanto a resultados espirituais.",
    links: ["termos-do-cliente", "privacidade-lgpd", "eventos-e-taxas"],
  },
  dados_sensiveis: {
    text:
      "Autorizo, de forma livre, informada e inequívoca, o Ilê Conecta a tratar os dados e as informações que eu fornecer sobre minha convicção religiosa ou necessidades espirituais, somente para viabilizar a contratação, a realização e a comunicação dos serviços com as casas espirituais, conforme a Política de Privacidade.",
    links: ["privacidade-lgpd"],
  },
  termos_casa: {
    text:
      "Li e aceito os Termos de Uso da Casa Espiritual: cadastro como pessoa física ou jurídica, repasse com retenção de até 72 horas úteis após a conclusão, reembolso e débito em caso de falha na entrega, responsabilidade pelos meus tributos e proibição de prometer resultado garantido.",
    links: ["termos-da-casa", "eventos-e-taxas"],
  },
};

/** Documentos exigidos em cada situação. */
export const CHECKOUT_DOCS = {
  ritual: ["checkout_ritual", "dados_sensiveis"],
  servico: ["checkout_servico", "dados_sensiveis"],
};
