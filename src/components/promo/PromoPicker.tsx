import { useState } from "react";
import { Button, Card, Input, Label } from "@/components/base";
import { DAY_PRESETS, MAX_DAYS, MIN_DAYS, clampDays, formatMoney, totalFor, type Money } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export interface PromoScope<K extends string> {
  key: K;
  label: string;
  description: string;
  perDay: Money;
}

/** Escolha de região + quantidade de dias com total calculado (valor por dia × dias). */
export default function PromoPicker<K extends string>({
  scopes,
  canSimulate,
  onSimulate,
  disabledReason,
}: {
  scopes: PromoScope<K>[];
  canSimulate: boolean;
  onSimulate: (scope: K, days: number) => void;
  disabledReason: string;
}) {
  const [scope, setScope] = useState<K>(scopes[0].key);
  const [days, setDays] = useState<number>(7);
  const current = scopes.find((s) => s.key === scope) ?? scopes[0];
  const total = totalFor(current.perDay, days);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              aria-pressed={scope === s.key}
              className={cn(
                "lift text-left rounded-[22px] border p-4",
                scope === s.key ? "border-gold bg-[#FBF2DE] ring-2 ring-gold/60 shadow-card dark:bg-gold/10" : "border-border bg-card hover:border-gold/60"
              )}
            >
              <div className="font-display font-bold">{s.label}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
              <div className="mt-3 text-sm">
                <span className="font-semibold text-primary">{formatMoney(s.perDay)}</span>
                {s.perDay !== null && <span className="text-muted-foreground"> / dia</span>}
              </div>
            </button>
          ))}
        </div>

        <Card className="p-4">
          <Label>Duração</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {DAY_PRESETS.map((d) => (
              <Button key={d} type="button" size="sm" variant={days === d ? "accent" : "outline"} onClick={() => setDays(d)}>
                {d} dias
              </Button>
            ))}
            <div className="flex items-center gap-2 ml-1">
              <span className="text-sm text-muted-foreground">ou</span>
              <Input
                aria-label="Quantidade de dias"
                type="number"
                min={MIN_DAYS}
                max={MAX_DAYS}
                className="w-24 h-9"
                value={days}
                onChange={(e) => setDays(clampDays(Number(e.target.value)))}
              />
              <span className="text-sm text-muted-foreground">dias (máx. {MAX_DAYS})</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5 h-fit relative overflow-hidden !border-0 text-white shadow-altar lg:sticky lg:top-24" style={{ background: "linear-gradient(135deg,#14543F,#0F3B2D)" }}>
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold">Resumo</div>
        <div className="mt-2 text-sm">{current.label} · {days} {days === 1 ? "dia" : "dias"}</div>
        <div className="mt-1 text-xs text-white/70">
          {current.perDay === null ? "Valor por dia a definir" : `${formatMoney(current.perDay)} × ${days}`}
        </div>
        <div className="font-display font-bold text-3xl text-white mt-3">{total === null ? "—" : formatMoney(total)}</div>
        <Button variant="gold" className="w-full mt-4" style={canSimulate ? undefined : { background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.78)", border: "1px solid rgba(255,255,255,.22)" }} disabled={!canSimulate} onClick={() => onSimulate(current.key, days)}>
          Simular
        </Button>
        {!canSimulate && <p className="mt-3 text-center text-xs text-gold">{disabledReason}</p>}
      </Card>
    </div>
  );
}
