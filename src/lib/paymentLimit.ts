import { supabase } from "@/lib/supabase";
import { MAX_PAYMENT_CENTS } from "@/lib/paymentsCore";

/** Teto por pagamento definido pelo admin (platform_settings 'payment_limits'). Sem registro, vale o padrão. */
export async function fetchPaymentMaxCents(): Promise<number> {
  if (!supabase) return MAX_PAYMENT_CENTS;
  const { data } = await supabase.rpc("payment_max_cents");
  const n = Number(data);
  return Number.isInteger(n) && n > 0 ? n : MAX_PAYMENT_CENTS;
}
