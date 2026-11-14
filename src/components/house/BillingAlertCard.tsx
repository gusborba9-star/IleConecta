import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchBillingStatus, payCharge } from "@/lib/platformBilling";
import { alertView, canPay, kindLabel, METHOD_LABELS, payMethods, shortDate, type AlertView } from "@/lib/platformBillingCore";
import { formatCents } from "@/lib/financePanelCore";

/** Confere de novo a cada meio minuto (e ao voltar para a aba) enquanto houver atraso, para o aviso sumir sozinho depois do pagamento. */
const REFRESH_MS = 30_000;

/**
 * Aviso da cobrança da plataforma na tela da casa. Só existe enquanto a casa tem fatura em atraso:
 * quando o pagamento é confirmado o card desaparece sozinho (sem recarregar a página).
 */
export default function BillingAlertCard({ refreshKey = 0, inactive = false }: { refreshKey?: number; inactive?: boolean }) {
  const { isRemoteAuth } = useApp();
  const [view, setView] = useState<AlertView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await fetchBillingStatus();
    // Falha de leitura NÃO esconde um aviso que já está na tela: só uma resposta válida muda o card.
    if (s) setView(alertView(s, { inactive }));
  }, [inactive]);

  useEffect(() => {
    if (!isRemoteAuth) return;
    void load();
  }, [isRemoteAuth, load, refreshKey]);

  const watching = view !== null;
  useEffect(() => {
    if (!isRemoteAuth || !watching) return;
    const t = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isRemoteAuth, watching, load]);

  if (!view) return null;

  const pay = async (id: string, method: "pix" | "card" | null) => {
    setBusy(`${id}:${method ?? "any"}`);
    const error = await payCharge(id, method);
    if (error) {
      setBusy(null);
      toast.error(error);
      void load();
    }
  };

  const strong = view.tone === "danger";
  return (
    <Card role="alert" className={`p-5 border-2 ${strong ? "border-[hsl(var(--danger))] bg-[hsl(var(--danger))]/5" : "border-gold bg-gold/10"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${strong ? "text-[hsl(var(--danger))]" : "text-gold-ink"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-lg">{view.title}</h2>
          <p className="text-sm mt-1">{view.text}</p>
          <ul className="mt-3 space-y-3">
            {view.charges.map((c) => (
              <li key={c.id} className="rounded-xl bg-card/70 p-3 ring-1 ring-border">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold">{c.description ?? kindLabel(c.kind)}</span>
                  <span className="font-display font-bold">{formatCents(c.amountCents)}</span>
                  <span className="text-xs text-muted-foreground">venceu em {shortDate(c.dueDate)}</span>
                </div>
                {canPay(c) ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(payMethods(c.methods).length ? payMethods(c.methods) : [null]).map((m) => (
                      <Button key={m ?? "any"} size="sm" variant={m === "pix" || m === null ? "gold" : "outline"} disabled={busy !== null} onClick={() => void pay(c.id, m)}>
                        {busy === `${c.id}:${m ?? "any"}` ? "Abrindo…" : m ? `Pagar com ${METHOD_LABELS[m].split(" (")[0]}` : "Pagar fatura"}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">Pagamento em análise.</p>
                )}
              </li>
            ))}
          </ul>
          {view.charges.length > 1 && <p className="text-xs text-muted-foreground mt-2">Total em atraso: <strong>{formatCents(view.totalCents)}</strong></p>}
        </div>
      </div>
    </Card>
  );
}
