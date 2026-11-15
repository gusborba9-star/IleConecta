// Estados do Brasil: a pessoa vê o nome, o sistema guarda a sigla (UF). Mesma lista do banco (função br_uf_from_text, migration 0115).
export const BR_STATES = [
  { uf: "AC", name: "Acre" }, { uf: "AL", name: "Alagoas" }, { uf: "AP", name: "Amapá" }, { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" }, { uf: "CE", name: "Ceará" }, { uf: "DF", name: "Distrito Federal (Brasília)" }, { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" }, { uf: "MA", name: "Maranhão" }, { uf: "MT", name: "Mato Grosso" }, { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" }, { uf: "PA", name: "Pará" }, { uf: "PB", name: "Paraíba" }, { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" }, { uf: "PI", name: "Piauí" }, { uf: "RJ", name: "Rio de Janeiro" }, { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" }, { uf: "RO", name: "Rondônia" }, { uf: "RR", name: "Roraima" }, { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" }, { uf: "SE", name: "Sergipe" }, { uf: "TO", name: "Tocantins" },
];

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const NAME_TO_UF = new Map(BR_STATES.map((s) => [fold(s.name.replace(/ \(.*\)$/, "")), s.uf]));
NAME_TO_UF.set("brasilia", "DF");
const UFS = new Set(BR_STATES.map((s) => s.uf));

/** Sigla (UF) a partir de sigla ou nome digitado em qualquer grafia (maiúsculas, acento); vazio se não reconhecer. */
export function ufFromText(raw) {
  const t = fold(raw);
  if (!t) return "";
  const up = t.toUpperCase();
  if (UFS.has(up)) return up;
  return NAME_TO_UF.get(t) ?? "";
}
