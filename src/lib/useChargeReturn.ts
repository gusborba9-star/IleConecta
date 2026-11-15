import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { syncCharge } from "@/lib/platformBilling";

/** Voltou da página de pagamento: confere a fatura agora (sem esperar o aviso do provedor) e avisa a tela para recarregar. */
export function useChargeReturn(enabled: boolean, onDone: (paid: boolean) => void) {
  const [params, setParams] = useSearchParams();
  const returned = params.get("retorno");
  const charge = params.get("fatura");
  useEffect(() => {
    if (!enabled || !returned || !charge || !/^[0-9a-f-]{36}$/i.test(charge)) return;
    let alive = true;
    void (async () => {
      const status = returned === "pago" ? await syncCharge(charge) : null;
      if (!alive) return;
      setParams({}, { replace: true });
      onDone(status === "paga");
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, returned, charge]);
}
