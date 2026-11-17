import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { focusRow } from "@/lib/focusCore.js";
import { supabase } from "@/lib/supabase";
import { fetchHouseTimeline } from "@/lib/houseTimeline";
import { EVENT_LABELS, eventDetail, filterEvents, mergeEvents, readHouseParam, type HouseTimelineView } from "@/lib/houseTimelineCore.js";
import { kindLabel, shortDate, statusLabel } from "@/lib/platformBillingCore";
import { formatBRL } from "@/lib/utils";

interface HouseOpt { house_id: string; name: string }
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Linha do tempo de uma casa para a administração: o que aconteceu com a plataforma, mais o que há a pagar (com o Pix). Só lê; abrir fica registrado. */
export default function AdminHouseTimelineCard() {
  const [params, setParams] = useSearchParams();
  const wanted = readHouseParam(params.get("casa"));
  const [houses, setHouses] = useState<HouseOpt[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<HouseTimelineView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("todos");

  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc("admin_houses_plans").then(({ data }) => setHouses(((data as HouseOpt[] | null) ?? []).map((h) => ({ house_id: String(h.house_id), name: String(h.name) }))));
  }, []);

  const open = useCallback(async (id: string) => {
    setBusy(true);
    setKind("todos");
    const r = await fetchHouseTimeline(id);
    setBusy(false);
    if (typeof r === "string") { setError(r); setView(null); return; }
    setError(null);
    setView(r);
  }, []);
  useEffect(() => {
    if (wanted) void open(wanted);
  }, [wanted, open]);

  const more = async () => {
    if (!view?.house || !view.nextBefore) return;
    setBusy(true);
    const r = await fetchHouseTimeline(view.house.id, view.nextBefore);
    setBusy(false);
    if (typeof r === "string") return void setError(r);
    setView({ ...view, events: mergeEvents(view.events, r.events), hasMore: r.hasMore, nextBefore: r.nextBefore });
  };

  const matches = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (t ? houses.filter((h) => h.name.toLowerCase().includes(t)) : houses).slice(0, 8);
  }, [houses, search]);
  const events = view ? filterEvents(view.events, kind) : [];
  const kinds = view ? [...new Set(view.events.map((e) => e.kind))] : [];

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">Linha do tempo da casa</h2>
          <p className="text-xs text-muted-foreground">Fatos da casa com a plataforma. Sem texto de conversa nem dados de clientes. Abrir a casa fica registrado.</p>
        </div>
        {view?.house && <Button size="sm" variant="outline" disabled={busy} onClick={() => void open(view.house!.id)} aria-label="Atualizar linha do tempo"><RefreshCw className="h-4 w-4" /> Atualizar</Button>}
      </div>

      <div className="space-y-2">
        <label className="sr-only" htmlFor="tl-search">Buscar casa pelo nome</label>
        <input id="tl-search" className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" placeholder="Buscar casa pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ul className="flex flex-wrap gap-2" aria-label="Casas">
          {matches.map((h) => (
            <li key={h.house_id}><Button size="sm" variant={view?.house?.id === h.house_id ? "gold" : "outline"} onClick={() => { setParams((p) => { const n = new URLSearchParams(p); n.set("casa", h.house_id); return n; }, { replace: true }); }}>{h.name}</Button></li>
          ))}
          {matches.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma casa com esse nome.</li>}
        </ul>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {busy && !view && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {view?.house && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong className="text-base">{view.house.name}</strong>
            <Badge tone="muted">Plano: {view.house.plan}</Badge>
          </div>

          {view.toPay && view.toPay.count > 0 ? (
            <section aria-label="A pagar à plataforma" className="rounded-xl border border-gold/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold">A pagar à plataforma</h3>
                <span className="font-semibold">{formatBRL(view.toPay.totalCents / 100)}</span>
              </div>
              <ul className="space-y-1.5">
                {view.toPay.charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{c.description || kindLabel(c.kind)} · vence {shortDate(c.dueDate)}{c.overdue ? " (vencida)" : ""}</span>
                    <span className="text-right">
                      {formatBRL(c.amountCents / 100)}
                      {c.pixDiscountCents > 0 && <span className="block text-xs text-forest">no Pix: {formatBRL((c.amountCents - c.pixDiscountCents) / 100)}{c.pixDiscountUntil ? ` até ${shortDate(c.pixDiscountUntil)}` : ""}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Nada a pagar à plataforma agora.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="tl-kind">Filtrar por tipo</label>
            <select id="tl-kind" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              {kinds.map((k) => <option key={k} value={k}>{EVENT_LABELS[k]}</option>)}
            </select>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada com esse filtro.</p>
          ) : (
            <ol className="space-y-2" aria-label="Eventos">
              {events.map((e) => (
                <li key={`${e.kind}-${e.refId}-${e.at}`} {...focusRow(e.refId)} className="rounded-xl border border-border p-3 text-sm space-y-0.5 pillow">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{EVENT_LABELS[e.kind]}</span>
                    <span className="text-xs text-muted-foreground">{when(e.at)}</span>
                  </div>
                  <p className="break-words">{e.title}{eventDetail(e) ? ` · ${eventDetail(e)}` : ""}</p>
                  {(e.amountCents !== null || e.status) && (
                    <p className="text-xs text-muted-foreground">{e.amountCents !== null ? formatBRL(e.amountCents / 100) : ""}{e.amountCents !== null && e.status ? " · " : ""}{e.status ? statusLabel(e.status).replace(/_/g, " ") : ""}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {view.hasMore && <Button variant="outline" disabled={busy} onClick={() => void more()}>{busy ? "Carregando…" : "Ver mais antigos"}</Button>}
        </>
      )}
    </Card>
  );
}
