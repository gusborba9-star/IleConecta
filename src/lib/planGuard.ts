import { toast } from "sonner";

/**
 * Recusas do plano e da agenda vindas do banco (limite de serviços, rituais, publicações; Grátis sem conta de recebimento;
 * ritual sobre atendimento ou bloqueio da agenda).
 * O banco escreve a mensagem em português; só ela é mostrada, e só quando é uma dessas (nunca texto técnico).
 */
const PLAN_GUARD = /^(Posts com a cara da sua casa|Letras com a sua identidade|Você chegou ao limite de |Para publicar (serviços|rituais com valor) no plano Grátis|Já existe um atendimento marcado neste horário|Este horário está bloqueado na sua agenda|Informe a duração do ritual|No Plano Grátis, a divulgação de contatos externos)/;
const NEEDS_PAYMENT = /conecte primeiro a sua conta de recebimento/;

let last: { m: string; at: number } | null = null;

/** Guarda a mensagem se o erro for uma recusa do plano. Devolve true quando guardou. */
export function rememberPlanGuard(error: { code?: string; message?: string } | null | undefined): boolean {
  const m = error?.message ?? "";
  if (error?.code === "P0001" && PLAN_GUARD.test(m)) { last = { m, at: Date.now() }; return true; }
  return false;
}

/** Mostra o motivo da recusa do plano (se houve) ou o texto padrão. Com conta de recebimento faltando, leva ao cadastro. */
export function toastSaveError(fallback: string): void {
  // Só vale para a recusa que acabou de acontecer (evita mostrar um motivo velho).
  const m = last && Date.now() - last.at < 5000 ? last.m : null;
  last = null;
  if (!m) { toast.error(fallback); return; }
  if (NEEDS_PAYMENT.test(m)) {
    toast.error("Ative sua conta de pagamento primeiro. No plano Grátis, os pagamentos são feitos pela plataforma.", {
      duration: 12000,
      action: { label: "Ativar agora", onClick: () => { window.location.assign("/"); } },
    });
    return;
  }
  toast.error(m, { duration: 10000, action: { label: "Ver planos", onClick: () => { window.location.assign("/planos"); } } });
}
