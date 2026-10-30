// Máscara de valor em reais: a pessoa digita só números e o campo monta "1.200,50" sozinho.
// Regras puras (sem React), testáveis em Node.

export const MONEY_MAX_DIGITS = 9; // até R$ 9.999.999,99

const onlyDigits = (s) => String(s ?? "").replace(/\D/g, "");

/** "10000" → "100,00"; "5" → "0,05"; "" → "". Zeros à esquerda são ignorados. */
export function maskMoney(text) {
  const digits = onlyDigits(text).replace(/^0+/, "").slice(0, MONEY_MAX_DIGITS);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${reais},${padded.slice(-2)}`;
}

/**
 * Aplica uma edição do campo. Se a pessoa apagou só a vírgula ou o ponto (os dígitos não mudaram),
 * entende como "apagar o último dígito", senão o campo ficaria preso.
 */
export function applyMoneyEdit(previous, next) {
  const prevDigits = onlyDigits(previous);
  const nextDigits = onlyDigits(next);
  if (String(next ?? "").length < String(previous ?? "").length && nextDigits === prevDigits) {
    return maskMoney(prevDigits.slice(0, -1));
  }
  return maskMoney(nextDigits);
}

/** Centavos inteiros → texto do campo ("10000" → "100,00"). 0, vazio ou inválido → "". */
export function centsToMasked(cents) {
  const n = Math.round(Number(cents));
  return Number.isFinite(n) && n > 0 ? maskMoney(String(n)) : "";
}

/** Texto do campo → centavos inteiros; null se vazio. */
export function maskedToCents(text) {
  const digits = onlyDigits(text).replace(/^0+/, "");
  return digits ? Number(digits.slice(0, MONEY_MAX_DIGITS)) : null;
}
