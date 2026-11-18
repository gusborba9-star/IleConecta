import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { fetchMaintenance } from "@/lib/maintenance";
import { maintenanceBanner } from "@/lib/maintenanceCore.js";

/** Faixa de aviso quando o dono liga o interruptor de emergência. Confere ao abrir, ao voltar para a aba e a cada 60 s. */
export default function MaintenanceBanner() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const m = await fetchMaintenance();
      if (alive) setText(maintenanceBanner(m));
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  if (!text) return null;
  return (
    <div role="status" className="border-b border-amber-300/70 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100 flex items-center justify-center gap-2">
      <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
