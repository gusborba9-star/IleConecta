import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { fetchHealth } from "@/lib/platformHealth";
import { CRON_STATE_TEXT, KIND_LABELS, STATUS_TEXT, ago, cronState, megabytes, overallStatus, type Health } from "@/lib/platformHealthCore.js";

const TONE = { ok: "forest", observar: "gold", atencao: "danger" } as const;

/** Saúde da plataforma (só o dono): erros do app, falhas da IA e das funções, rotinas agendadas e banco. Os alertas chegam no sino. */
export default function PlatformHealthCard() {
  const [h, setH] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const r = await fetchHealth();
    setBusy(false);
    if (typeof r === "string") return void setError(r);
    setError(null);
    setH(r);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const status = h ? overallStatus(h) : null;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg">Saúde da plataforma</h2>
          <p className="text-xs text-muted-foreground">Erros do app (sem identificar ninguém), falhas da IA e das funções, rotinas agendadas e banco. Se algo quebrar, o aviso chega no seu sino.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()} aria-label="Atualizar saúde da plataforma"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : h === null || status === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[status]}>{STATUS_TEXT[status]}</Badge>
            {h.alerts.length > 0 && <span className="text-xs text-muted-foreground">{h.alerts.length} alerta{h.alerts.length === 1 ? "" : "s"} em aberto</span>}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(KIND_LABELS) as (keyof typeof h.lastHour)[]).map((k) => (
              <div key={k} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{KIND_LABELS[k]}</p>
                <p className="text-2xl font-bold tabular-nums">{h.lastHour[k]}<span className="ml-1 text-xs font-normal text-muted-foreground">na última hora</span></p>
                <p className="text-xs text-muted-foreground tabular-nums">{h.last24h[k]} nas últimas 24 h</p>
              </div>
            ))}
          </div>

          <section aria-label="Erros mais frequentes">
            <h3 className="text-sm font-semibold mb-1">Erros mais frequentes (24 h)</h3>
            {h.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum erro registrado nas últimas 24 horas.</p>
            ) : (
              <ul className="space-y-1.5">
                {h.top.map((t, i) => (
                  <li key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="gold">{t.n}×</Badge>
                      <span className="text-xs text-muted-foreground">{KIND_LABELS[t.kind] ?? t.kind} · {t.source}{t.route ? ` · ${t.route}` : ""} · último {ago(t.lastAt)}</span>
                    </div>
                    <p className="mt-1 break-words font-mono text-xs">{t.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Rotinas agendadas">
            <h3 className="text-sm font-semibold mb-1">Rotinas agendadas</h3>
            {h.cron.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem informação das rotinas agendadas.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {h.cron.map((c) => {
                  const st = cronState(c);
                  return (
                    <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="font-mono text-xs">{c.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {c.lastRun ? `última ${ago(c.lastRun)}` : "nunca rodou"} · {c.runs24} em 24 h
                        <Badge tone={st === "ok" ? "forest" : st === "desligada" || st === "ainda_nao_rodou" ? "gold" : "danger"}>{CRON_STATE_TEXT[st]}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted-foreground">Banco: {megabytes(h.db.sizeBytes)} · {h.db.connections} conexões abertas · lido {ago(h.generatedAt)}</p>
        </>
      )}
    </Card>
  );
}
