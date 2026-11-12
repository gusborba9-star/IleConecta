// Taxas da plataforma no painel admin: conversão entre porcentagem digitada e pontos-base (100 pb = 1%). Puro e testável.
// A fonte da verdade é a tabela fee_rule_versions do banco; aqui só ficam os rótulos e a conversão.
export const FEE_KINDS = [
  { key: "ritual", label: "Rituais coletivos" },
  { key: "servico", label: "Serviços, trabalhos e jogos" },
  { key: "mensalidade", label: "Mensalidades de membros" },
];
export const MAX_FEE_BPS = 3000;

/** "15", "15,5", "4.25" → pontos-base inteiros; null se inválido (negativo, mais de 2 casas, acima de 30%). */
export function parsePercent(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps >= 0 && bps <= MAX_FEE_BPS ? bps : null;
}

/** 1500 → "15"; 425 → "4,25"; 450 → "4,5". */
export function formatPercent(bps) {
  const n = Number(bps);
  if (!Number.isInteger(n) || n < 0) return "";
  const whole = Math.floor(n / 100), frac = n % 100;
  if (frac === 0) return String(whole);
  return `${whole},${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** Quais tipos mudaram entre a regra vigente e a digitada (para mostrar o resumo antes de salvar). */
export function changedKinds(current, next) {
  return FEE_KINDS.filter((k) => Number(current?.[k.key]) !== Number(next?.[k.key])).map((k) => k.key);
}
