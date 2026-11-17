import { adminPath, readFocus } from "@/lib/focusCore.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { fetchPendingCenter } from "@/lib/pendingCenter";
import { KIND_LABELS, PRIORITY_LABELS, TAB_TARGET, dueText, filterPending, type PendingView } from "@/lib/pendingCenterCore.js";

// Tipos cujo registro aparece na linha do tempo da casa (o item vem destacado lá).
const TIMELINE_KINDS = new Set(["suporte", "moderacao", "avaliacao_denunciada", "reembolso_cliente", "reembolso_plataforma", "cobranca_travada"]);
// Só estes tipos têm uma linha própria, com o mesmo id, na tela de destino (os outros abrem só a seção).
const FOCUS_KINDS = new Set(["suporte", "moderacao", "denuncia_chat", "avaliacao_denunciada", "reembolso_cliente", "cobranca_travada"]);

/** Central de pendências: tudo que espera a administração, vencidos primeiro, com atalho para onde se resolve. */
export default function PendingCenterCard() {
  const [, setParams] = useSearchParams();
  const [view, setView] = useState<PendingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("todos");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const r = await fetchPendingCenter();
    setBusy(false);
    if (typeof r === "string") return void setError(r);
    setError(null);
    setView(r);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => (view ? filterPending(view.items, { kind, onlyOverdue }) : []), [view, kind, onlyOverdue]);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">Central de pendências</h2>
          <p className="text-xs text-muted-foreground">O que está esperando a administração. Lido das fontes originais na hora; vencidos primeiro.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()} aria-label="Atualizar pendências"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : view === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : view.total === 0 ? (
        <p className="text-sm text-muted-foreground">Nada pendente agora.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={view.overdue > 0 ? "danger" : "forest"}>{view.overdue} vencida{view.overdue === 1 ? "" : "s"}</Badge>
            <span className="text-muted-foreground">de {view.total} pendência{view.total === 1 ? "" : "s"}</span>
            {view.total > view.shown && <span className="text-xs text-muted-foreground">(mostrando as {view.shown} mais urgentes)</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="pend-kind">Filtrar por tipo</label>
            <select id="pend-kind" className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              {Object.entries(view.counts).map(([k, n]) => <option key={k} value={k}>{KIND_LABELS[k]} ({n})</option>)}
            </select>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Só vencidas</label>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pendência com esse filtro.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((i) => {
                const target = i.tab ? TAB_TARGET[i.tab] : null;
                return (
                  <li key={`${i.kind}-${i.refId}`} className="rounded-xl border border-border p-3 text-sm space-y-1 pillow">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={i.overdue ? "danger" : i.priority === "normal" ? "muted" : "gold"}>{i.overdue ? "Vencida" : PRIORITY_LABELS[i.priority]}</Badge>
                      <span className="font-semibold">{KIND_LABELS[i.kind]}</span>
                      {i.houseName && <span className="text-xs text-muted-foreground">· {i.houseName}</span>}
                    </div>
                    <p className="break-words">{i.title}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={i.overdue ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"}>{dueText(i.dueAt)}{i.overdue ? ` · prioridade ${PRIORITY_LABELS[i.priority].toLowerCase()}` : ""}</span>
                      {target && <Button size="sm" variant="outline" onClick={() => setParams(Object.fromEntries(new URLSearchParams(adminPath(target.section, FOCUS_KINDS.has(i.kind) ? i.refId : null).slice(1))))}>Resolver em {target.label}</Button>}
                      {i.houseId && <Button size="sm" variant="ghost" onClick={() => setParams({ s: "usuarios", casa: i.houseId as string, ...(TIMELINE_KINDS.has(i.kind) && readFocus(i.refId) ? { foco: i.refId } : {}) })}>Linha do tempo da casa</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
