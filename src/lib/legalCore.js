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

/**
 * Aceite único. Os Termos são obrigatórios para usar a plataforma; a autorização de dados sensíveis é oferecida na mesma tela,
 * em caixa separada e opcional (consentimento tem de ser livre: sem marcar, a pessoa entra e a autorização só é pedida ao contratar).
 */
export const REQUIRED_DOCS = {
  cliente: ["termos_cliente"],
  casa: ["termos_casa"],
};
export const OPTIONAL_DOCS = {
  cliente: ["dados_sensiveis"],
  casa: [],
};

const accountKey = (accountType) => (accountType === "commercial" ? "casa" : "cliente");

/**
 * Situação de um documento, a partir dos registros de aceite da pessoa (em qualquer ordem):
 * "ok" (aceito na versão vigente), "old" (aceito numa versão antiga: pede de novo uma vez), "never" (nunca aceitou)
 * ou "withdrawn" (retirou a autorização; só vale para dados sensíveis e não é cobrada de novo na entrada).
 */
export function consentStatus(rows, doc, version) {
  const keys = doc === "dados_sensiveis" ? ["dados_sensiveis", "dados_sensiveis_retirada"] : [doc];
  const mine = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && keys.includes(r.doc_key))
    .sort((a, b) => String(b.accepted_at ?? "").localeCompare(String(a.accepted_at ?? "")));
  const last = mine[0];
  if (!last) return { status: "never" };
  if (last.doc_key === "dados_sensiveis_retirada") return { status: "withdrawn", at: last.accepted_at };
  return { status: last.doc_version === version ? "ok" : "old", version: last.doc_version, at: last.accepted_at };
}

const pending = (rows, doc, version) => ["never", "old"].includes(consentStatus(rows, doc, version).status);

/**
 * O que a tela de aceite mostra agora. `required` vazio = a tela não aparece.
 * `optional` só vem junto quando a tela aparece (nunca abre sozinha por causa de um documento opcional).
 */
export function gateDocs(accountType, rows, version) {
  const k = accountKey(accountType);
  const required = REQUIRED_DOCS[k].filter((d) => pending(rows, d, version));
  const optional = required.length ? OPTIONAL_DOCS[k].filter((d) => pending(rows, d, version)) : [];
  return { required, optional };
}
