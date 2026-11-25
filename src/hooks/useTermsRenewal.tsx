import { useCallback, useRef, useState, type ReactNode } from "react";
import AcceptNowModal from "@/components/legal/AcceptNowModal";
import { fetchConsentRows } from "@/lib/consents";
import { LEGAL_VERSION, consentStatus, type ConsentDocKey } from "@/lib/legalCore";

/**
 * Antes de fechar uma nova venda ou assinatura da casa: se o aceite do documento está numa versão antiga, abre o aceite da versão vigente
 * (grava versão, data e IP) e só então segue. Se não for possível consultar, segue: o servidor continua conferindo nas compras do cliente.
 */
export function useTermsRenewal(userId: string | undefined, doc: ConsentDocKey, reason: string): { ensure: () => Promise<boolean>; modal: ReactNode } {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };
  const ensure = useCallback(async () => {
    if (!userId) return true;
    const rows = await fetchConsentRows(userId);
    if (!rows) return true;
    if (consentStatus(rows, doc, LEGAL_VERSION).status === "ok") return true;
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    });
  }, [userId, doc]);
  const modal = open ? <AcceptNowModal docs={[doc]} reason={reason} onClose={() => finish(false)} onAccepted={() => finish(true)} /> : null;
  return { ensure, modal };
}
