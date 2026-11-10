import { createHmac } from "node:crypto";
/** Assinatura de aviso no formato do Stripe (só para testes). */
export async function signStripePayload(raw, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
}
