// Textos de aceite versionados. Rascunho: precisa de revisão jurídica antes de os pagamentos serem ligados.
// Ao mudar qualquer texto, mude também LEGAL_VERSION: cada aceite do usuário guarda a versão que ele viu.
export const LEGAL_VERSION = "2026-10-rascunho-2";

export const CONSENT_DOCS = {
  termos_cliente: {
    text:
      "Li e concordo com os Termos de Uso do cliente e a Política de Privacidade, que incluem as regras de cancelamento e reembolso de rituais e serviços. Compreendo que o Ilê Conecta atua exclusivamente como plataforma intermediária entre clientes e casas espirituais, e que o pagamento é processado por instituição de pagamento parceira.",
    links: ["termos-do-cliente", "privacidade-lgpd", "eventos-e-taxas"],
  },
  dados_sensiveis: {
    text:
      "Autorizo, de forma livre, informada e inequívoca, o Ilê Conecta a tratar os dados e as informações que eu fornecer sobre minha convicção religiosa ou necessidades espirituais, somente para viabilizar a contratação, a realização e a comunicação dos serviços com as casas espirituais, conforme a Política de Privacidade.",
    links: ["privacidade-lgpd"],
  },
  termos_casa: {
    text:
      "Li e aceito os Termos de Uso da Casa Espiritual: cadastro como pessoa física ou jurídica, recebimento direto na minha conta de pagamento (a tarifa do processador de pagamento é cobrada de mim), comissão da plataforma de 15% sobre rituais e 4% sobre serviços, reembolso integral devolvido a partir da minha conta em caso de cancelamento antes do início ou falha na entrega, responsabilidade pelos meus tributos e proibição de prometer resultado garantido.",
    links: ["termos-da-casa", "eventos-e-taxas"],
  },
};

/** Documentos exigidos em cada situação. */
export const CHECKOUT_DOCS = {
  ritual: ["termos_cliente", "dados_sensiveis"],
  servico: ["termos_cliente", "dados_sensiveis"],
};
