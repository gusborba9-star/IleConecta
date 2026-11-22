import { cn } from "@/lib/utils";
import { EMPTY, activeCount, type Facet, type FilterState } from "@/lib/ritualFiltersCore.js";

const chip = (on: boolean) => cn("inline-flex shrink-0 min-h-9 items-center gap-1 rounded-full border px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-forest bg-forest text-forest-foreground shadow-card" : "border-border bg-card hover:bg-muted");

/** Filtros contextuais: só aparece o grupo que separa resultados (ou que já está ligado); cada opção mostra quantos resultados dá. */
export default function RitualFilters({ facets, value, onChange }: { facets: Facet[]; value: FilterState; onChange: (v: FilterState) => void }) {
  const groups = facets.filter((f) => f.show);
  const active = activeCount(value);
  if (groups.length === 0 && active === 0) return null;
  return (
    <div className="mt-3 space-y-2" role="group" aria-label="Filtros">
      <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-0.5 whitespace-nowrap">
        {groups.map((g) =>
          g.kind === "flag" ? (
            <button key={g.id} type="button" aria-pressed={Boolean(value[g.id as keyof FilterState])} onClick={() => onChange({ ...value, [g.id]: !value[g.id as keyof FilterState] })} className={chip(Boolean(value[g.id as keyof FilterState]))}>
              {g.label} <span className="opacity-70">{g.count}</span>
            </button>
          ) : (
            <span key={g.id} role="group" aria-label={g.label} className="flex shrink-0 gap-1.5">
              {g.options!.filter((o) => o.count > 0 || value[g.id as "modo"] === o.id).map((o) => {
                const on = value[g.id as "modo"] === o.id;
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange({ ...value, [g.id]: on ? "" : o.id })} className={chip(on)}>
                    {o.label} <span className="opacity-70">{o.count}</span>
                  </button>
                );
              })}
            </span>
          ),
        )}
      </div>
      {active > 0 && <button type="button" onClick={() => onChange({ ...EMPTY })} className="min-h-9 text-xs font-semibold text-primary hover:underline">Limpar filtros ({active})</button>}
    </div>
  );
}
