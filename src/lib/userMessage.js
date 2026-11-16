// Mensagem de erro que pode ser mostrada à pessoa: só as frases em português que o próprio banco levanta de propósito.
// Erros técnicos do banco/servidor (SQLSTATE, "relation ... does not exist", violação de regra, JWT…) nunca aparecem na tela.
const TECH = /sqlstate|relation\b|column\b|does not exist|already exists|violates|syntax error|permission denied|invalid input|null value|constraint|jwt|at character|pgrst|function\b|stack|undefined|\[object|<|>|\{|\}/i;

/** A mensagem, se for segura para exibir; senão o texto de reserva. */
export function userMessage(message, fallback = "") {
  const s = typeof message === "string" ? message.trim() : "";
  return s && s.length < 260 && /[a-zà-ú]/i.test(s) && !TECH.test(s) ? s : fallback;
}
