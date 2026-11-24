import { useEffect } from "react";
import { toast } from "sonner";
import { hasNewVersion, readRemoteBuild } from "@/lib/updateCheckCore";

const EVERY_MS = 5 * 60_000;

/** Avisa (sem recarregar sozinho) quando há uma versão nova publicada: ao voltar para o app e a cada 5 minutos. Quem está numa reunião não é interrompido. */
export function useUpdatePrompt() {
  useEffect(() => {
    if (typeof __BUILD_ID__ === "undefined" || import.meta.env.DEV) return;
    let shown = false;
    const check = async () => {
      if (shown) return;
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const remote = readRemoteBuild(await res.json());
        if (hasNewVersion(__BUILD_ID__, remote)) {
          shown = true;
          toast.info("Há uma versão nova do app.", { duration: Infinity, action: { label: "Atualizar", onClick: () => window.location.reload() } });
        }
      } catch { /* sem rede: tenta de novo depois */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => void check(), EVERY_MS);
    void check();
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(t); };
  }, []);
}
