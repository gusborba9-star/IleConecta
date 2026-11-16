// CPF/CNPJ da casa: confere os dígitos e formata enquanto a pessoa digita. O banco confere de novo e é quem guarda (criptografado).
// CNPJ aceita o formato alfanumérico da Receita Federal (12 posições 0-9/A-Z + 2 dígitos verificadores; valor da letra = código ASCII − 48).
/** Só letras e números, em maiúsculas (usado para formatar enquanto digita). */
export const onlyDigits = (v) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

const calc = (vals, weights) => {
  const s = vals.reduce((acc, d, i) => acc + d * weights[i], 0) % 11;
  return s < 2 ? 0 : 11 - s;
};

/** "cpf", "cnpj" ou null (dígitos verificadores errados, tamanho errado, sequência repetida ou caracteres que não são parte de um documento). */
export function taxIdKind(value) {
  if (typeof value !== "string" || value.length > 40 || !/^[0-9A-Za-z./ -]+$/.test(value.trim())) return null;
  const d = value.trim().replace(/[./ -]/g, "").toUpperCase();
  if (!d || /^(.)\1*$/.test(d)) return null;
  if (d.length === 11 && /^[0-9]{11}$/.test(d)) {
    const n = [...d].map(Number);
    const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const c = (a, w) => { const r = (a.reduce((t, x, i) => t + x * w[i], 0) * 10) % 11; return r === 10 ? 0 : r; };
    return c(n.slice(0, 9), w1) === n[9] && c(n.slice(0, 10), w2) === n[10] ? "cpf" : null;
  }
  if (d.length === 14 && /^[0-9A-Z]{12}[0-9]{2}$/.test(d)) {
    const n = [...d].map((ch) => ch.charCodeAt(0) - 48);
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return calc(n.slice(0, 12), w1) === n[12] && calc(n.slice(0, 13), w2) === n[13] ? "cnpj" : null;
  }
  return null;
}

/** Máscara progressiva: até 11 números vira CPF; com letra ou de 12 a 14 posições vira CNPJ. */
export function formatTaxIdInput(value) {
  const d = onlyDigits(value).slice(0, 14);
  const cnpj = d.length > 11 || /[A-Z]/.test(d);
  if (!cnpj) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  return d.replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2").replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3").replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3/$4").replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})\.([0-9A-Z]{3})\/([0-9A-Z]{4})([0-9A-Z])/, "$1.$2.$3/$4-$5");
}

/** Estado do banco (my_tax_id_status) → o que a tela precisa. */
export function readTaxIdStatus(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    hasHouse: o.has_house === true,
    set: o.set === true,
    kind: o.kind === "cpf" || o.kind === "cnpj" ? o.kind : null,
    masked: typeof o.masked === "string" && /^(\*{3}\.\*{3}\.\*{3}-\d{2}|\*{2}\.\*{3}\.\*{3}\/\*{4}-\d{2})$/.test(o.masked) ? o.masked : null,
    subscribed: o.subscribed === true,
  };
}
