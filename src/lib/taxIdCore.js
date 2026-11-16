// CPF/CNPJ da casa: confere os dígitos e formata enquanto a pessoa digita. O banco confere de novo e é quem guarda (criptografado).
export const onlyDigits = (v) => String(v ?? "").replace(/\D/g, "");

const calc = (digits, weights) => {
  const s = digits.reduce((acc, d, i) => acc + d * weights[i], 0) % 11;
  return s < 2 ? 0 : 11 - s;
};

/** "cpf", "cnpj" ou null (dígitos verificadores errados, tamanho errado ou sequência repetida). */
export function taxIdKind(value) {
  const d = onlyDigits(value);
  if (/^(\d)\1*$/.test(d)) return null;
  const n = [...d].map(Number);
  if (d.length === 11) {
    const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return calc(n.slice(0, 9), w1) === n[9] && calc(n.slice(0, 10), w2) === n[10] ? "cpf" : null;
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return calc(n.slice(0, 12), w1) === n[12] && calc(n.slice(0, 13), w2) === n[13] ? "cnpj" : null;
  }
  return null;
}

/** Máscara progressiva: até 11 dígitos vira CPF, de 12 a 14 vira CNPJ. */
export function formatTaxIdInput(value) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
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
