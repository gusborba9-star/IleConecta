import { useState, type ReactNode } from "react";
import { Button, Card, Input, Label } from "@/components/base";
import { editDaysDraft } from "@/lib/promotionsCore";
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
  real,
  maxDays = MAX_DAYS,
}: {
  scopes: PromoScope<K>[];
  canSimulate: boolean;
  onSimulate?: (scope: K, days: number) => void;
  disabledReason: string;
  /** Contratação de verdade (com cobrança). Sem isso, só simula (modo demonstração). */
  real?: {
    onBuy: (scope: K, days: number, authorized: boolean) => void;
    busy: boolean;
    /** Motivo de um alcance estar indisponível agora (ex.: vagas ocupadas). */
    blocked?: Partial<Record<K, string>>;
    /** Conteúdo extra embaixo do resumo (ex.: botão da lista de espera). */
    extra?: (scope: K) => ReactNode;
  };
  maxDays?: number;
}) {
  const [scope, setScope] = useState<K>(scopes[0].key);
  const [days, setDays] = useState<number>(() => Math.max(MIN_DAYS, Math.min(7, maxDays)));
  const [agreed, setAgreed] = useState(false);
  // Texto digitado no campo de dias: fica livre enquanto a pessoa edita (pode ficar vazio) e só é ajustado ao sair do campo.
  const [draft, setDraft] = useState<string | null>(null);
  const current = scopes.find((s) => s.key === scope) ?? scopes[0];
  const cap = Math.max(MIN_DAYS, Math.min(MAX_DAYS, maxDays));
  const shownDays = Math.min(days, cap);
  const draftInvalid = draft !== null && (draft === "" || Number(draft) < MIN_DAYS);
  const total = draftInvalid ? null : totalFor(current.perDay, shownDays);
  const blockedReason = real?.blocked?.[scope];

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
            {DAY_PRESETS.filter((d) => d <= cap).map((d) => (
              <Button key={d} type="button" size="sm" variant={shownDays === d ? "accent" : "outline"} onClick={() => { setDays(d); setDraft(null); }}>
                {d} dias
              </Button>
            ))}
            <div className="flex items-center gap-2 ml-1">
              <span className="text-sm text-muted-foreground">ou</span>
              <Input
                aria-label="Quantidade de dias"
                type="text"
                maxLength={3}
                className="w-24 h-9"
                inputMode="numeric"
                value={draft ?? String(shownDays)}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const r = editDaysDraft(e.target.value, cap);
                  setDraft(r.text);
                  if (r.days !== null) setDays(r.days);
                }}
                onBlur={() => setDraft(null)}
              />
              <span className="text-sm text-muted-foreground">dias (máx. {cap})</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5 h-fit relative overflow-hidden !border-0 text-white shadow-altar lg:sticky lg:top-24" style={{ background: "linear-gradient(135deg,#14543F,#0F3B2D)" }}>
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold">Resumo</div>
        <div className="mt-2 text-sm">{current.label} · {shownDays} {shownDays === 1 ? "dia" : "dias"}</div>
        <div className="mt-1 text-xs text-white/70">
          {current.perDay === null ? "Valor por dia a definir" : `${formatMoney(current.perDay)} × ${shownDays}`}
        </div>
        <div className="font-display font-bold text-3xl text-white mt-3">{total === null ? "—" : formatMoney(total)}</div>
        {real ? (
          <>
            <label className="mt-4 flex items-start gap-2 text-xs text-white/85">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4A73A]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>Autorizo o início imediato do serviço contratado. O prazo começa a contar quando o pagamento for confirmado.</span>
            </label>
            <Button variant="gold" className="w-full mt-3" disabled={!agreed || real.busy || total === null || Boolean(blockedReason)} onClick={() => real.onBuy(current.key, shownDays, agreed)}>
              {real.busy ? "Abrindo pagamento…" : blockedReason ? "Indisponível" : "Contratar"}
            </Button>
            {blockedReason && <p className="mt-3 text-center text-xs text-gold">{blockedReason}</p>}
            {real.extra?.(current.key)}
          </>
        ) : (
          <>
            <Button variant="gold" className="w-full mt-4" style={canSimulate ? undefined : { background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.78)", border: "1px solid rgba(255,255,255,.22)" }} disabled={!canSimulate || draftInvalid} onClick={() => onSimulate?.(current.key, shownDays)}>
              Simular
            </Button>
            {!canSimulate && <p className="mt-3 text-center text-xs text-gold">{disabledReason}</p>}
          </>
        )}
      </Card>
    </div>
  );
}
