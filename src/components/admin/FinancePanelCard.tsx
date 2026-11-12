import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import { supabase } from "@/lib/supabase";
import { SEVERITY_LABELS, anomalyLabel, kindLabel, formatCents, readAnomalies, readSummary, severityTone, type FinanceAnomalies, type FinanceSummary } from "@/lib/financePanelCore";

type Tab = "resumo" | "conferencia";
const PERIODS = [7, 30, 90];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

/** Financeiro da plataforma (Blueprint §19.6). Fechado por padrão: só consulta o banco ao abrir, e cada consulta fica registrada. */
export default function FinancePanelCard() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("resumo");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [anoms, setAnoms] = useState<FinanceAnomalies | null>(null);

  const load = useCallback(async (which: Tab, d: number) => {
    if (!supabase) return;
    setBusy(true);
    const res = which === "resumo" ? await supabase.rpc("admin_finance_summary", { p_days: d }) : await supabase.rpc("admin_finance_anomalies");
    setBusy(false);
    if (res.error) return void toast.error("Não foi possível carregar o financeiro agora.");
    if (which === "resumo") setSummary(readSummary(res.data));
    else setAnoms(readAnomalies(res.data));
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !summary) void load("resumo", days);
  };
  const pick = (t: Tab) => {
    setTab(t);
    if (t === "conferencia" && !anoms) void load("conferencia", days);
    if (t === "resumo" && !summary) void load("resumo", days);
  };

  return (
    <Card className="p-5">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="flex-1">
          <span className="block font-display font-bold text-lg">Financeiro da plataforma</span>
          <span className="block text-xs text-muted-foreground">Resumo do período e conferência de pagamentos, livro-razão e comissões.</span>
        </span>
        {anoms && anoms.total > 0 && <Badge tone="danger">{anoms.total}</Badge>}
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-muted p-1" role="tablist">
              {([["resumo", "Resumo"], ["conferencia", "Conferência"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>
              ))}
            </div>
            {tab === "resumo" && (
              <select aria-label="Período" value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); void load("resumo", d); }} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
                {PERIODS.map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}
              </select>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => load(tab, days)}>{busy ? "Atualizando…" : "Atualizar"}</Button>
          </div>

          {tab === "resumo" && summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Volume confirmado" value={formatCents(summary.confirmedGross)} hint={`${summary.confirmedN} pagamentos`} />
                <Stat label="Comissão da plataforma" value={formatCents(summary.platformFee)} />
                <Stat label="Tarifa do provedor" value={formatCents(summary.processorFeeKnown)} hint={summary.processorFeePendingN ? `${summary.processorFeePendingN} ainda pendente(s)` : "toda conhecida"} />
                <Stat label="Estornado" value={formatCents(summary.refundedGross)} hint={`${summary.refundedN} pagamento(s)`} />
              </div>
              {summary.byKind.length > 0 && (
                <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
                  {summary.byKind.map((k) => (
                    <li key={k.kind} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 font-semibold">{kindLabel(k.kind)}</span>
                      <span className="text-muted-foreground">{k.n}</span>
                      <span className="w-28 text-right">{formatCents(k.gross)}</span>
                      <span className="w-24 text-right text-muted-foreground">{formatCents(k.fee)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{summary.payments} no período</Badge>
                {summary.pendingN > 0 && <Badge tone="gold">{summary.pendingN} pendente(s)</Badge>}
                {summary.failedN > 0 && <Badge>{summary.failedN} que falharam</Badge>}
                {summary.contestedN > 0 && <Badge tone="danger">{summary.contestedN} contestado(s)</Badge>}
                {summary.refundsOpenN > 0 && <Badge tone="gold">{summary.refundsOpenN} reembolso(s) em aberto{summary.refundsOpenOldestDays > 0 ? `, o mais antigo há ${summary.refundsOpenOldestDays} dia(s)` : ""}</Badge>}
                {summary.feeRuleVersion && <Badge tone="forest">Regra vigente {summary.feeRuleVersion}</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground">Valores em reais a partir de centavos inteiros do nosso banco. Comissão e volume contam só pagamentos confirmados no período.</p>
            </div>
          )}

          {tab === "conferencia" && anoms && (
            <div className="space-y-3">
              {anoms.total === 0 ? (
                <p className="rounded-2xl bg-forest/10 p-3 text-sm text-forest">Tudo certo: pagamentos, livro-razão, comissões e reembolsos conferem.</p>
              ) : (
                <>
                  <p className="text-sm">{anoms.total} item(ns) para revisar{anoms.total > anoms.shown ? ` (mostrando os ${anoms.shown} mais graves)` : ""}.</p>
                  <ul className="space-y-2">
                    {anoms.items.map((i, idx) => (
                      <li key={`${i.paymentId}-${i.code}-${idx}`} className="rounded-2xl border border-border p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge tone={severityTone(i.severity)}>{SEVERITY_LABELS[i.severity]}</Badge>
                          <span className="font-semibold flex-1">{anomalyLabel(i.code)}</span>
                          <span className="text-muted-foreground">{formatCents(i.amount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{i.detail}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Pagamento {i.paymentId.slice(0, 8)} · {i.at ? new Date(i.at).toLocaleDateString("pt-BR") : "sem data"}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {anoms.scope && <p className="text-[11px] text-muted-foreground">{anoms.scope}</p>}
            </div>
          )}
          {((tab === "resumo" && !summary) || (tab === "conferencia" && !anoms)) && <p className="text-sm text-muted-foreground">{busy ? "Carregando…" : "Sem dados ainda."}</p>}
        </div>
      )}
    </Card>
  );
}
