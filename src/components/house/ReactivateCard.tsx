import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Power } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { fetchPlanRefund } from "@/lib/aiCredits";
import { startReactivation } from "@/lib/platformBilling";
import { PLANS, formatMoney, type PlanId } from "@/lib/pricing";

/**
 * Casa inativa por reembolso do plano: a própria casa volta pagando a mensalidade do plano atual.
 * Pagou, a casa é reativada e matriculada de novo na cobrança (sem novo reembolso de 7 dias). O suporte segue podendo reativar no painel.
 */
export default function ReactivateCard({ plan, refreshKey = 0 }: { plan: PlanId | null; refreshKey?: number }) {
  const { isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<PlanId | null>(null);

  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchPlanRefund().then((r) => alive && setCancelled(r?.cancelled === true));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, refreshKey]);

  if (!cancelled) return null;
  const choice: PlanId | null = pick ?? plan ?? PLANS.find((p) => config.pricing.plans[p.id].monthly !== null)?.id ?? null;
  const info = choice ? config.pricing.plans[choice] : null;
  const price = info && info.monthly !== null ? formatMoney(info.monthly) : null;
  const go = async (method: "pix" | "card") => {
    setBusy(method);
    if (!choice) return;
    const error = await startReactivation(choice, method);
    if (error) {
      setBusy(null);
      toast.error(error);
    }
  };
  return (
    <Card role="status" className="p-5 border-2 border-gold bg-gold/10">
      <div className="flex items-start gap-3">
        <Power className="h-5 w-5 mt-0.5 shrink-0 text-gold-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-lg">Sua casa está inativa</h2>
          <p className="text-sm mt-1">A assinatura foi cancelada com reembolso. Seus dados estão guardados. Para voltar, escolha o plano e pague: ao confirmar o pagamento, a casa volta na hora e a cobrança mensal recomeça.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plano para reativar">
            {PLANS.filter((p) => config.pricing.plans[p.id].monthly !== null).map((p) => {
              const i = config.pricing.plans[p.id];
              const on = choice === p.id;
              return (
                <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setPick(p.id)} className={`rounded-xl border p-3 text-left text-sm ${on ? "border-forest bg-forest/10 ring-2 ring-forest" : "border-border bg-card"}`}>
                  <span className="block font-semibold">{i.name}{plan === p.id ? " (seu plano anterior)" : ""}</span>
                  <span className="block font-display font-bold">{formatMoney(i.monthly)}<span className="text-xs font-normal text-muted-foreground"> / mês</span></span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="gold" disabled={busy !== null || !choice} onClick={() => void go("pix")}>{busy === "pix" ? "Abrindo…" : `Reativar${price ? ` por ${price}` : ""} com Pix`}</Button>
            <Button size="sm" variant="outline" disabled={busy !== null || !choice} onClick={() => void go("card")}>{busy === "card" ? "Abrindo…" : "Reativar com cartão"}</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Ao pagar, você contrata o plano novamente e concorda com os <Link to="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Uso</Link>. Esta contratação não tem novo reembolso de 7 dias. Dúvidas? Fale com o suporte.</p>
        </div>
      </div>
    </Card>
  );
}
