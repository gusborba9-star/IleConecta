// Regras de dinheiro da plataforma (puras, testáveis). O banco aplica as mesmas regras em fee_cents()/confirm_payment().
// Valores sempre em centavos inteiros; taxa em pontos-base (bps): 1700 = 17%.

export const FEE_RULE_VERSION = "v1-2026-10";
export const FEE_BPS = { ritual: 1700, servico_pix: 500 };
export const HOLD_HOURS = 72;
export const PIX_HOLD_MINUTES = 15;

/** Taxa em centavos, arredondada para o centavo mais próximo (metade para cima). */
export function feeCents(grossCents, kind) {
  const gross = Number(grossCents);
  const bps = FEE_BPS[kind];
  if (!Number.isInteger(gross) || gross < 0 || bps === undefined) throw new Error("Valor ou tipo inválido.");
  return Math.floor((gross * bps + 5000) / 10000);
}

/** Divisão de uma venda: a plataforma fica com a taxa e a casa recebe o líquido. */
export function splitSale(grossCents, kind) {
  const fee = feeCents(grossCents, kind);
  return { gross: Number(grossCents), fee, net: Number(grossCents) - fee };
}

/** Quando o repasse fica elegível: 72h depois do fim do ritual (ou do início, se não houver fim). */
export function payoutEligibleAt(endsAtIso, startsAtIso, startedAtIso) {
  const base = endsAtIso || startedAtIso || startsAtIso;
  const t = new Date(base).getTime();
  if (!Number.isFinite(t)) throw new Error("Data inválida.");
  return new Date(t + HOLD_HOURS * 3600 * 1000).toISOString();
}

/** Uma reserva aguardando pagamento só segura a vaga até expirar. */
export function holdExpiresAt(now = new Date()) {
  return new Date(now.getTime() + PIX_HOLD_MINUTES * 60 * 1000).toISOString();
}

/** Resumo de receita de um ritual para a casa: vendas confirmadas, taxa e líquido. */
export function ritualRevenue(priceCents, confirmedSeats) {
  const gross = Number(priceCents) * Number(confirmedSeats);
  return splitSale(gross, "ritual");
}
