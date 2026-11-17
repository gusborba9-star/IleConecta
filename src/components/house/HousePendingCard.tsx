import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { fetchHousePending } from "@/lib/housePending";
import { HOUSE_KIND_LABELS, HOUSE_PRIORITY_LABELS, dueText, filterPending, houseDestination, type HousePendingView } from "@/lib/housePendingCore.js";
import { kindLabel, shortDate } from "@/lib/platformBillingCore.js";
import { formatBRL } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";

/** Central de pendências da casa: o que espera a casa (ou a equipe, conforme a permissão), vencidos primeiro, mais o que há a pagar à plataforma. */
export default function HousePendingCard() {
  const nav = useNavigate();
  const { currentUser } = useApp();
  const [view, setView] = useState<HousePendingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("todos");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const r = await fetchHousePending();
    setBusy(false);
    if (typeof r === "string") return void setError(r);
    setError(null);
    setView(r);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => (view ? filterPending(view.items as never, { kind, onlyOverdue }) : []) as HousePendingView["items"], [view, kind, onlyOverdue]);
  const toPay = view?.toPay && view.toPay.count > 0 ? view.toPay : null;
  // Quem não é da casa (ou o modo de demonstração) não vê o cartão, em vez de ver um erro.
  if (error && /not_house|Disponível só/i.test(error)) return null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">Central de pendências</h2>
          <p className="text-xs text-muted-foreground">{view?.role === "equipe" ? "O que espera a casa e que você pode acompanhar." : "O que está esperando por você, vencidos primeiro."}</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()} aria-label="Atualizar pendências"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : view === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {view.total === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente agora.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={view.overdue > 0 ? "danger" : "forest"}>{view.overdue} vencida{view.overdue === 1 ? "" : "s"}</Badge>
                <span className="text-muted-foreground">de {view.total} pendência{view.total === 1 ? "" : "s"}</span>
                {view.total > view.shown && <span className="text-xs text-muted-foreground">(mostrando as {view.shown} mais urgentes)</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="hpend-kind">Filtrar por tipo</label>
                <select id="hpend-kind" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="todos">Todos os tipos</option>
                  {Object.entries(view.counts).map(([k, n]) => <option key={k} value={k}>{HOUSE_KIND_LABELS[k]} ({n})</option>)}
                </select>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Só vencidas</label>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma pendência com esse filtro.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((i) => {
                    const target = houseDestination(i, view.role, currentUser?.id);
                    return (
                      <li key={`${i.kind}-${i.refId}`} className="rounded-xl border border-border p-3 text-sm space-y-1 pillow">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={i.overdue ? "danger" : i.priority === "alta" ? "gold" : "muted"}>{i.overdue ? "Vencida" : HOUSE_PRIORITY_LABELS[i.priority]}</Badge>
                          <span className="font-semibold">{HOUSE_KIND_LABELS[i.kind]}</span>
                        </div>
                        <p className="break-words">{i.title}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={i.overdue ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"}>{dueText(i.dueAt)}</span>
                          {target && <Button size="sm" variant="outline" onClick={() => nav(target.path)}>Abrir {target.label}</Button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {toPay && (
            <section aria-label="A pagar à plataforma" className="rounded-xl border border-gold/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold">A pagar à plataforma</h3>
                <span className="font-semibold">{formatBRL(toPay.totalCents / 100)}</span>
              </div>
              <ul className="space-y-1.5">
                {toPay.charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <button type="button" className="min-w-0 break-words text-left underline-offset-2 hover:underline" aria-label={`Abrir fatura: ${kindLabel(c.kind)}`} onClick={() => nav(`/planos?foco=${encodeURIComponent(c.id)}`)}>{kindLabel(c.kind)} · vence {shortDate(c.dueDate)}{c.overdue ? " (vencida)" : ""}</button>
                    <span className="text-right">
                      {formatBRL(c.amountCents / 100)}
                      {c.pixDiscountCents > 0 && <span className="block text-xs text-forest">no Pix: {formatBRL((c.amountCents - c.pixDiscountCents) / 100)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={() => nav(toPay.charges.length === 1 ? `/planos?foco=${encodeURIComponent(toPay.charges[0].id)}` : "/planos")}>{toPay.charges.length === 1 ? "Abrir fatura e pagar" : "Ver faturas e pagar"}</Button>
            </section>
          )}
        </>
      )}
    </Card>
  );
}
