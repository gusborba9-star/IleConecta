import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Minimize2, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { fetchHousePending } from "@/lib/housePending";
import { HOUSE_KIND_LABELS, HOUSE_PRIORITY_LABELS, dueText, filterPending, houseDestination, type HousePendingView } from "@/lib/housePendingCore.js";
import { kindLabel, shortDate } from "@/lib/platformBillingCore.js";
import { formatBRL } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { fetchCredits } from "@/lib/aiCredits";
import { badgeText, bubbleCount, bubbleLabel, readBubble, shouldReopen, shownPriority, writeBubble } from "@/lib/pendingMinimizeCore.js";

/** Central de pendências da casa: o que espera a casa (ou a equipe, conforme a permissão), vencidos primeiro, mais o que há a pagar à plataforma. */
export default function HousePendingCard({ collapsible = false }: { collapsible?: boolean }) {
  const nav = useNavigate();
  const { currentUser } = useApp();
  const [view, setView] = useState<HousePendingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("todos");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  // Minimizar não esconde nem apaga: a central vira um balão flutuante com o número de pendências (estado guardado neste aparelho).
  const userId = currentUser?.id ?? "";
  const [bubble, setBubble] = useState(() => readBubble(userId));
  const [hasCredits, setHasCredits] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [justOpened, setJustOpened] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchCredits().then((c) => alive && setHasCredits((c?.packs.length ?? 0) > 0));
    return () => { alive = false; };
  }, []);

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
  const count = bubbleCount(view);
  const minimize = () => { const st = { minimized: true, overdue: view?.overdue ?? 0 }; setBubble(st); writeBubble(userId, st); };
  const expand = () => { const st = { minimized: false, overdue: 0 }; setBubble(st); writeBubble(userId, st); setJustOpened(true); };
  // Surgiu pendência vencida nova: a central abre sozinha (o balão não pode esconder urgência).
  useEffect(() => {
    if (collapsible && view && shouldReopen(bubble, view.overdue)) { const st = { minimized: false, overdue: 0 }; setBubble(st); writeBubble(userId, st); }
  }, [collapsible, view, bubble, userId]);
  // Depois de abrir pelo balão, leva a tela e o foco até a central.
  useEffect(() => {
    if (!justOpened) return;
    setJustOpened(false);
    cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    cardRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [justOpened, bubble.minimized]);
  // Quem não é da casa (ou o modo de demonstração) não vê o cartão, em vez de ver um erro.
  if (error && /not_house|Disponível só/i.test(error)) return null;

  if (collapsible && bubble.minimized && view && count > 0) {
    return (
      <button
        type="button"
        onClick={expand}
        aria-label={bubbleLabel(count, view.overdue)}
        className="fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 grid h-14 w-14 place-items-center rounded-full bg-card text-primary shadow-altar ring-2 ring-gold transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring lg:bottom-6"
      >
        <ClipboardList className="h-6 w-6" aria-hidden />
        <span aria-hidden className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-1 text-xs font-bold leading-none text-white ring-2 ring-card">{badgeText(count)}</span>
      </button>
    );
  }

  return (
    <div ref={cardRef} className="scroll-mt-20">
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 tabIndex={-1} className="font-display font-bold text-lg outline-none">Central de pendências</h2>
          <p className="text-xs text-muted-foreground">{view?.role === "equipe" ? "O que espera a casa e que você pode acompanhar." : "O que está esperando por você, vencidos primeiro."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()} aria-label="Atualizar pendências"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          {collapsible && count > 0 && <Button size="sm" variant="outline" onClick={minimize}><Minimize2 className="h-4 w-4" aria-hidden /> Minimizar</Button>}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : view === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {view.total === 0 ? (
            toPay ? null : <p className="text-sm text-muted-foreground">Nada pendente agora.</p>
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
                    const prio = shownPriority(i, { hasCredits });
                    return (
                      <li key={`${i.kind}-${i.refId}`} className="rounded-xl border border-border p-3 text-sm space-y-1 pillow">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={i.overdue ? "danger" : prio === "alta" ? "gold" : "muted"}>{i.overdue ? "Vencida" : HOUSE_PRIORITY_LABELS[prio]}</Badge>
                          <span className="min-w-0 flex-1 font-semibold">{HOUSE_KIND_LABELS[i.kind]}</span>
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
    </div>
  );
}
