import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import {
  adminModerationAct, adminModerationList, adminModerationScan, adminModerationStartAdaptation, type ModerationRow,
} from "@/lib/moderation";
import {
  ADAPTATION_DAYS, REASON_LABEL, STATUS_LABEL, TARGET_LABEL, adaptationEnd, adminActions, inAdaptation,
} from "@/lib/moderationCore.js";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "");

/** Fila de moderação: promessas garantidas e conteúdo antigo com contato externo. Orienta, adverte, oculta só o anúncio, analisa contestações. */
export default function AdminModerationCard() {
  const [rows, setRows] = useState<ModerationRow[]>([]);
  const [filter, setFilter] = useState<string>("abertas");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await adminModerationList()); } catch (e) { toast.error((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const start = rows[0]?.adaptation_start ?? null;
  const days = rows[0]?.adaptation_days ?? ADAPTATION_DAYS;
  const adapt = inAdaptation(start, days);
  const end = adaptationEnd(start, days);
  const shown = rows.filter((r) => (filter === "abertas" ? r.status !== "encerrada" : filter === "todas" ? true : r.status === filter));
  const pending = rows.filter((r) => r.status === "pendente").length;
  const contested = rows.filter((r) => r.status === "contestada").length;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const act = (r: ModerationRow, action: string) => run(() => adminModerationAct(r.id, action, notes[r.id]), "Feito.");

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">
        Moderação de anúncios{" "}
        {(pending > 0 || contested > 0) && <span className="text-sm text-destructive">({pending} novos · {contested} contestações)</span>}
      </h2>
      <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-2">
        {!start ? (
          <>
            <p>O período de adaptação de {days} dias ainda não começou. Enquanto isso só é possível <b>orientar</b> (sem advertência por promessa). Inicie o período no dia em que enviar o aviso geral às casas.</p>
            <Button size="sm" disabled={busy} onClick={() => void run(() => adminModerationStartAdaptation(), "Período de adaptação iniciado.")}>Iniciar período de adaptação</Button>
          </>
        ) : adapt ? (
          <p>Período de adaptação até <b>{end?.toLocaleDateString("pt-BR")}</b>: só orientação, sem advertência por promessa.</p>
        ) : (
          <p>Período de adaptação encerrado em {end?.toLocaleDateString("pt-BR")}. Advertências liberadas (prazo de 72 horas).</p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const n = await adminModerationScan(); toast.message(n ? `${n} item(ns) novo(s) na fila.` : "Nada novo encontrado."); }, "Varredura concluída.")}>Varrer conteúdo já publicado</Button>
          <select aria-label="Filtro" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="abertas">Abertas</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="todas">Todas</option>
          </select>
        </div>
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Nada nesta lista.</p>}
      {shown.map((r) => {
        const actions = adminActions(r);
        return (
          <div key={r.id} className="rounded-lg border border-border/70 p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-semibold">{r.house_name}</span> · {TARGET_LABEL[r.target_table]} · {REASON_LABEL[r.reason]}</div>
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[r.status]} · {fmt(r.created_at)}</div>
            </div>
            <p className="text-muted-foreground">“{r.excerpt}”</p>
            {r.deadline_at && r.status === "advertida" && <p className="text-xs">Prazo até {fmt(r.deadline_at)}</p>}
            {r.contest_text && <div className="rounded-md bg-muted/50 p-2 text-xs"><b>Contestação ({fmt(r.contested_at)}):</b> {r.contest_text}</div>}
            {r.admin_note && <p className="text-xs text-muted-foreground">Nota: {r.admin_note}</p>}
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Input aria-label="Nota" className="flex-1 min-w-[12rem]" placeholder="Nota para a casa/registro (opcional)" maxLength={500} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                {actions.map((a) => (
                  <Button key={a.id} size="sm" variant={a.danger ? "danger" : "outline"} disabled={busy} onClick={() => void act(r, a.id)}>{a.label}</Button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
