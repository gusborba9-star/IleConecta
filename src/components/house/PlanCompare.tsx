import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";
import { Card } from "@/components/base";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { compareRows } from "@/lib/planMatrixCore";
import { FREE_PLAN_NAME, isFeatureOn, visiblePlanIds, type FeatureKey, type HousePlanId } from "@/lib/platformConfigCore";
import { formatMoney } from "@/lib/pricing";

/** Celular estreito: a tabela de 4 colunas não cabe, então mostra um plano por vez (escolhido nos botões acima da lista). */
function useNarrow() {
  const q = "(max-width: 639px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** "Compare os planos": ferramentas nas linhas, planos nas colunas. Lê tudo da matriz de planos; o plano da casa fica destacado. */
export default function PlanCompare({ mine, userId }: { mine: HousePlanId | null; userId?: string }) {
  const { config } = usePlatformConfig();
  // colunas: Grátis, planos com preço e o plano atual (o Plus só aparece quando tiver preço ou for o plano da casa)
  const ids = visiblePlanIds(config, mine);
  const rows = compareRows(config.plan_matrix, (f) => isFeatureOn(config, f as FeatureKey, userId), ids);
  const name = (id: HousePlanId) => (id === "gratis" ? FREE_PLAN_NAME : config.pricing.plans[id].name);
  const price = (id: HousePlanId) => (id === "gratis" ? "R$ 0" : formatMoney(config.pricing.plans[id].monthly));
  const narrow = useNarrow();
  const [pick, setPick] = useState<HousePlanId | null>(null);
  const shownId: HousePlanId = pick && ids.includes(pick) ? pick : mine ?? ids[1];
  const shownIdx = ids.indexOf(shownId);
  const cellCls = (i: number) => (mine === ids[i] ? "bg-primary/10" : "");
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-display font-bold text-xl">Compare os planos</h2>
      <p className="text-sm text-muted-foreground mt-1">Veja lado a lado o que cada plano inclui.</p>
      {narrow ? (
        <div className="mt-4">
          <div role="radiogroup" aria-label="Plano a ver" className="flex flex-wrap gap-2">
            {ids.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={shownId === id} onClick={() => setPick(id)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${shownId === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
                {name(id)}{mine === id ? " · seu plano" : ""}
              </button>
            ))}
          </div>
          <p className="mt-3 font-display text-lg font-bold">{name(shownId)} <span className="text-sm font-normal text-muted-foreground">{price(shownId)}{shownId !== "gratis" && " / mês"}</span></p>
          <ul className="mt-1 divide-y divide-border/60 text-sm">
            {rows.map((r) => {
              const c = r.cells[shownIdx];
              return (
                <li key={r.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 break-words">{r.label}</span>
                  <span className="shrink-0 text-right">
                    {c === "Incluído" ? <Check className="h-4 w-4 text-forest" aria-label="Incluído" />
                      : c === "—" ? <Minus className="h-4 w-4 text-muted-foreground/60" aria-label="Não incluído" />
                      : <span className="font-semibold">{c}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
      <div className="mt-4 overflow-x-auto -mx-4 sm:mx-0" role="region" aria-label="Comparação de planos, role para o lado para ver tudo" tabIndex={0}>
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card p-2 text-left font-medium text-muted-foreground">Ferramenta</th>
              {ids.map((id, i) => (
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
      )}
      <p className="text-xs text-muted-foreground mt-3">{narrow ? "Toque em um plano para ver o que ele inclui. " : "Deslize para o lado para ver todos os planos. "}Respostas da assistente além do plano podem ser compradas em pacotes avulsos.</p>
    </Card>
  );
}
