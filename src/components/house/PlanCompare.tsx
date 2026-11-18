import { Check, Minus } from "lucide-react";
import { Card } from "@/components/base";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { compareRows } from "@/lib/planMatrixCore";
import { FREE_PLAN_NAME, HOUSE_PLAN_IDS, isFeatureOn, type FeatureKey, type HousePlanId } from "@/lib/platformConfigCore";
import { formatMoney } from "@/lib/pricing";

/** "Compare os planos": ferramentas nas linhas, planos nas colunas. Lê tudo da matriz de planos; o plano da casa fica destacado. */
export default function PlanCompare({ mine, userId }: { mine: HousePlanId | null; userId?: string }) {
  const { config } = usePlatformConfig();
  const rows = compareRows(config.plan_matrix, (f) => isFeatureOn(config, f as FeatureKey, userId));
  const name = (id: HousePlanId) => (id === "gratis" ? FREE_PLAN_NAME : config.pricing.plans[id].name);
  const price = (id: HousePlanId) => (id === "gratis" ? "R$ 0" : formatMoney(config.pricing.plans[id].monthly));
  const cellCls = (i: number) => (mine === HOUSE_PLAN_IDS[i] ? "bg-primary/10" : "");
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-display font-bold text-xl">Compare os planos</h2>
      <p className="text-sm text-muted-foreground mt-1">Veja lado a lado o que cada plano inclui.</p>
      <div className="mt-4 overflow-x-auto -mx-4 sm:mx-0" role="region" aria-label="Comparação de planos, role para o lado para ver tudo" tabIndex={0}>
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground">Ferramenta</th>
              {HOUSE_PLAN_IDS.map((id, i) => (
                <th key={id} scope="col" className={`p-2 text-center align-bottom ${cellCls(i)}`}>
                  <span className="block font-display font-bold">{name(id)}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{price(id)}{id !== "gratis" && " / mês"}</span>
                  {mine === id && <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Seu plano</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/60">
                <th scope="row" className="sticky left-0 z-10 bg-card p-2 text-left font-normal">{r.label}</th>
                {r.cells.map((c, i) => (
                  <td key={i} className={`p-2 text-center ${cellCls(i)}`}>
                    {c === "Incluído" ? <Check className="mx-auto h-4 w-4 text-forest" aria-label="Incluído" />
                      : c === "—" ? <Minus className="mx-auto h-4 w-4 text-muted-foreground/60" aria-label="Não incluído" />
                      : <span className="font-semibold">{c}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Deslize para o lado para ver todos os planos. Respostas da assistente além do plano podem ser compradas em pacotes avulsos.</p>
    </Card>
  );
}
