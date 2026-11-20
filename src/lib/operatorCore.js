// Identificação do operador da plataforma (Termos e Política). Lógica pura, usada no app e nos testes.
// O banco confere tudo de novo (migration 0168): aqui só evita ida e volta e mostra a mensagem em português.
export const CPF_MASKED = /^\*{3}\.\d{3}\.\d{3}-\*{2}$/;
export const CNPJ_FULL = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const BAD_CHARS = /[<>\u0000-\u001f\u007f]/;
const squeeze = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Aceita só o que pode ser publicado: CPF mascarado ou CNPJ completo. */
export function documentKind(doc) {
  const d = String(doc ?? "").trim();
  if (CPF_MASKED.test(d)) return "cpf";
  if (CNPJ_FULL.test(d)) return "cnpj";
  return null;
}

/** Devolve a mensagem de erro (em português) ou null se os campos podem ser salvos. */
export function operatorProblem(f) {
  const name = squeeze(f?.name);
  if (name.length < 3 || name.length > 120 || BAD_CHARS.test(name)) return "Informe o nome completo (de 3 a 120 letras).";
  if (!documentKind(f?.document)) return "Documento inválido: use o CPF mascarado (***.123.456-**) ou o CNPJ completo (00.000.000/0000-00). O CPF completo não pode ser publicado.";
  const address = squeeze(f?.address);
  if (address && (address.length < 5 || address.length > 200 || BAD_CHARS.test(address))) return "Endereço inválido (de 5 a 200 caracteres).";
  const email = String(f?.email ?? "").trim();
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) return "E-mail de atendimento inválido.";
  return null;
}

/** Frase de abertura dos Termos e da Política. Sem dados (falha de leitura), devolve null: a página não mostra nada. */
export function operatorSentence(op) {
  const name = squeeze(op?.name);
  const kind = documentKind(op?.document);
  if (!name || !kind) return null;
  const address = squeeze(op?.address);
  const email = String(op?.email ?? "").trim();
  const inscrito = kind === "cnpj" ? "inscrita no CNPJ" : "inscrito(a) no CPF";
  const sede = address ? `, com endereço em ${address}` : "";
  const canal = email ? `pelo e-mail ${email} ou pelo suporte interno do aplicativo` : "pelo suporte interno do aplicativo";
  return `A plataforma Ilê Conecta é operada e administrada por ${name}, ${inscrito} sob o nº ${String(op.document).trim()}${sede}, com canal de atendimento eletrônico ${canal}.`;
}

/** Páginas institucionais que levam a identificação do operador no início. */
export const OPERATOR_SLUGS = ["normas-de-uso", "termos-do-cliente", "termos-da-casa", "privacidade-lgpd"];
