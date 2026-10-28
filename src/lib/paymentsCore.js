// Regras de dinheiro da plataforma (puras, testáveis). O banco aplica as mesmas regras em fee_cents()/confirm_payment().
// Valores sempre em centavos inteiros; taxa em pontos-base (bps): 1500 = 15%.

// Comissão da plataforma (application fee do Stripe, cobrança direta): ritual 15%; serviço 4% (Pix ou cartão à vista).
// 'servico_pix' é sinônimo de 'servico' (nome antigo). Mesma regra de fee_cents() no banco (migration 0019).
export const FEE_RULE_VERSION = "v2-2026-10";
export const FEE_BPS = { ritual: 1500, servico: 400, servico_pix: 400 };
// Teto por pagamento pela plataforma (o Pix do Stripe tem limite por pagamento). Ajustável no banco (payment_limits).
export const MAX_PAYMENT_CENTS = 1000000;
// LEGADO: a retenção de 72h valia quando a plataforma segurava o dinheiro. Em pagamentos Stripe a casa recebe direto.
export const HOLD_HOURS = 72;
export const PIX_HOLD_MINUTES = 15;
// Tarifa do Stripe cobrada da casa (tabela pública do Stripe Brasil, conferida em 28/10/2026). É estimativa: vale o valor real do Stripe.
export const PROCESSOR_FEE = { pix: { bps: 119, fixed: 0 }, card: { bps: 399, fixed: 39 } };

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

/** Estimativa da tarifa do Stripe (cobrada da casa) para mostrar o que a casa recebe. method: "pix" | "card". */
export function processorFeeEstimate(grossCents, method) {
  const gross = Number(grossCents);
  const f = PROCESSOR_FEE[method];
  if (!Number.isInteger(gross) || gross < 0 || !f) throw new Error("Valor ou forma de pagamento inválida.");
  return Math.floor((gross * f.bps + 5000) / 10000) + (gross > 0 ? f.fixed : 0);
}

/** O que a casa recebe de uma venda: bruto menos a comissão da plataforma e a tarifa estimada do Stripe. */
export function houseReceives(grossCents, kind, method) {
  const sale = splitSale(grossCents, kind);
  const processor = processorFeeEstimate(grossCents, method);
  return { gross: sale.gross, platformFee: sale.fee, processorFee: processor, net: sale.gross - sale.fee - processor };
}

/** LEGADO (plataforma segurando o dinheiro): repasse elegível 72h depois do fim do ritual (ou do início, se não houver fim). */
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
