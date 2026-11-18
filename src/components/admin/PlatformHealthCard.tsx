import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { ackAlert, fetchHealth, runRoutine } from "@/lib/platformHealth";
import { CRON_STATE_TEXT, KIND_LABELS, STATUS_TEXT, WHO_TEXT, ago, cronDescription, describeAlert, describeError, cronState, cronWhen, megabytes, overallStatus, type Health } from "@/lib/platformHealthCore.js";

const TONE = { ok: "forest", observar: "gold", atencao: "danger" } as const;

/** Saúde da plataforma (só o dono): erros do app, falhas da IA e das funções, rotinas agendadas e banco. Os alertas chegam no sino. */
export default function PlatformHealthCard() {
  const [h, setH] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runMsg, setRunMsg] = useState<{ name: string; ok: boolean; text: string } | null>(null);

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

  const run = async (name: string) => {
    setConfirm(null);
    setRunning(name);
    const r = await runRoutine(name);
    setRunning(null);
    setRunMsg({ name, ok: r.ok, text: r.ok ? "Rotina executada. Toque em “Atualizar” em alguns segundos para ver o resultado." : `Falhou de novo: ${r.message} Me mande um print desta tela.` });
    void load();
  };
  const ack = async (code: string) => {
    await ackAlert(code);
    void load();
  };

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

          {(h.maintenance.assistant || h.maintenance.payments) && (
            <p role="status" className="rounded-xl border border-amber-300/70 bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              <strong>Manutenção ligada:</strong> {[h.maintenance.assistant ? "assistente" : null, h.maintenance.payments ? "pagamentos" : null].filter(Boolean).join(" e ")}
              {h.maintenance.since ? `, ${ago(h.maintenance.since)}` : ""}. Os usuários estão vendo o aviso. Desligue no card “Interruptor de emergência” quando resolver.
            </p>
          )}

          {h.alerts.length > 0 && (
            <section aria-label="Alertas em aberto">
              <h3 className="text-sm font-semibold mb-1">Alertas em aberto</h3>
              <ul className="space-y-1.5">
                {h.alerts.map((a) => {
                  const d = describeAlert(a.code);
                  return (
                    <li key={a.code} className="rounded-lg border border-border text-sm">
                      <details>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                          <Badge tone={a.seenAt ? "gold" : "danger"}>{a.seenAt ? "visto" : "novo"}</Badge>
                          <span className="font-medium">{d.title}</span>
                          <span className="text-xs text-muted-foreground">desde {ago(a.since)}</span>
                        </summary>
                        <div className="space-y-2 border-t border-border px-3 py-2">
                          <p className="text-xs font-semibold">{WHO_TEXT[d.who]}</p>
                          <ol className="list-decimal space-y-1 pl-5 text-xs">
                            {d.steps.map((st) => <li key={st}>{st}</li>)}
                          </ol>
                          {!a.seenAt && <Button size="sm" variant="outline" onClick={() => void ack(a.code)}>Já vi</Button>}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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
                  <li key={i} className="rounded-lg border border-border text-sm">
                    <details>
                      <summary className="cursor-pointer px-3 py-2">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Badge tone="gold">{t.n}×</Badge>
                          <span className="text-xs text-muted-foreground">{KIND_LABELS[t.kind] ?? t.kind} · {t.source}{t.route ? ` · ${t.route}` : ""} · último {ago(t.lastAt)}</span>
                        </span>
                        <p className="mt-1 break-words font-mono text-xs">{t.detail}</p>
                      </summary>
                      <div className="space-y-1.5 border-t border-border px-3 py-2">
                        <p className="text-xs text-muted-foreground">Primeiro registro {ago(t.firstAt)}, último {ago(t.lastAt)}.</p>
                        <p className="text-xs font-semibold">{WHO_TEXT[describeError(t.kind, t.source).who]}</p>
                        <ol className="list-decimal space-y-1 pl-5 text-xs">
                          {describeError(t.kind, t.source).steps.map((st) => <li key={st}>{st}</li>)}
                        </ol>
                      </div>
                    </details>
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
                    <li key={c.name} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 basis-full">
                        <span className="font-mono text-xs">{c.name}</span>
                        {cronDescription(c.name) && <p className="mt-0.5 text-xs text-foreground/80">{cronDescription(c.name)}</p>}
                        {cronWhen(c.schedule) && <p className="text-xs text-muted-foreground">Roda {cronWhen(c.schedule)}</p>}
                      </div>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {c.lastRun ? `última ${ago(c.lastRun)}` : "nunca rodou"} · {c.runs24} em 24 h
                        <Badge tone={st === "ok" ? "forest" : st === "desligada" || st === "ainda_nao_rodou" ? "gold" : "danger"}>{CRON_STATE_TEXT[st]}</Badge>
                      </span>
                      {c.canRun && (
                        <div className="basis-full flex flex-wrap items-center gap-2">
                          {confirm === c.name ? (
                            <>
                              <span className="text-xs">Rodar “{c.name}” agora?</span>
                              <Button size="sm" onClick={() => void run(c.name)}>Rodar</Button>
                              <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" disabled={running !== null} onClick={() => { setRunMsg(null); setConfirm(c.name); }} aria-label={`Rodar agora a rotina ${c.name}`}>
                              {running === c.name ? "Rodando…" : "Rodar agora"}
                            </Button>
                          )}
                          {runMsg?.name === c.name && <span role="status" className={`text-xs ${runMsg.ok ? "text-muted-foreground" : "text-destructive"}`}>{runMsg.text}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {h.manualRuns.length > 0 && (
            <section aria-label="Últimas execuções manuais">
              <h3 className="text-sm font-semibold mb-1">Últimas execuções manuais</h3>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {h.manualRuns.map((m, i) => <li key={i}><span className="font-mono">{m.routine}</span> · {ago(m.at)} · {m.ok ? "rodou" : `falhou${m.note ? `: ${m.note}` : ""}`}</li>)}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted-foreground">Banco: {megabytes(h.db.sizeBytes)} · {h.db.connections} conexões abertas · lido {ago(h.generatedAt)}</p>
        </>
      )}
    </Card>
  );
}
