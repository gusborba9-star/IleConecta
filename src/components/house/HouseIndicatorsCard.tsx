import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/base";
import { fetchHouseIndicators } from "@/lib/houseIndicators";
import { PERIODS, changeInfo, formatIndicator, groupedIndicators, type HouseIndicatorsView } from "@/lib/houseIndicatorsCore.js";

const TONE = { good: "text-forest", bad: "text-destructive", none: "text-muted-foreground" } as const;

/** Indicadores da casa: cada número com a variação sobre o período anterior e, em "Como é calculado", a definição e a origem dos dados. */
export default function HouseIndicatorsCard() {
  const [days, setDays] = useState(30);
  const [view, setView] = useState<HouseIndicatorsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setBusy(true);
    const r = await fetchHouseIndicators(d);
    setBusy(false);
    if (typeof r === "string") return void setError(r);
    setError(null);
    setView(r);
  }, []);
  useEffect(() => {
    void load(days);
  }, [days, load]);

  if (error && /not_house|Disponível só|permissão/i.test(error) && !view) return null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">Indicadores da casa</h2>
          <p className="text-xs text-muted-foreground">Comparados com os {days} dias anteriores. Toque em um número para ver como é calculado.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load(days)} aria-label="Atualizar indicadores"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Período">
        {PERIODS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={days === p} onClick={() => setDays(p)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${days === p ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>{p} dias</button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : view === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        groupedIndicators(view).map((g) => (
          <section key={g.group} aria-label={g.group} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{g.group}</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {g.items.map((i) => {
                const ch = changeInfo(i.key, i.current, i.previous);
                const shown = open === i.key;
                return (
                  <li key={i.key} className="rounded-xl border border-border p-3 pillow">
                    <button type="button" className="w-full min-h-11 text-left" aria-expanded={shown} aria-label={`${i.label}: como é calculado`} onClick={() => setOpen(shown ? null : i.key)}>
                      <span className="block text-xs text-muted-foreground">{i.label}</span>
                      <span className="block font-display font-bold text-2xl">{formatIndicator(i.key, i.current)}</span>
                      {ch.text && <span className={`block text-xs font-semibold ${TONE[ch.tone]}`}>{ch.text}</span>}
                    </button>
                    {shown && (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground border-t border-border pt-2">
                        <p><strong>O que é:</strong> {i.definition}</p>
                        <p><strong>De onde vem:</strong> {i.source}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {view && <p className="text-xs text-muted-foreground">{view.totalFollowers} {view.totalFollowers === 1 ? "pessoa segue" : "pessoas seguem"} a casa hoje.</p>}
    </Card>
  );
}
