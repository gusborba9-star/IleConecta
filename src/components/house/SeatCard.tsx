import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { formatCents } from "@/lib/financePanelCore";
import { startSeat } from "@/lib/platformBilling";
import { fetchSeatStatus, scheduleSeatRelease, undoSeatRelease } from "@/lib/seats";
import { canBuySeat, dateBR, keepOptions, type SeatStatus } from "@/lib/seatsCore";

/** Vagas extras de equipe: contratar (valor proporcional até a renovação) e reduzir (vale até o fim do ciclo pago). */
export default function SeatCard({ onChanged }: { onChanged?: () => void }) {
  const confirm = useConfirm();
  const [st, setSt] = useState<SeatStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  const load = useCallback(async () => setSt(await fetchSeatStatus()), []);
  useEffect(() => { void load(); }, [load]);
  if (!st || !st.hasHouse || !st.subscribed) return null;

  const buy = async (method: "pix" | "card") => {
    setBusy(method);
    const err = await startSeat(method);
    setBusy(null);
    if (err) toast.error(err);
  };
  const options = keepOptions(st);
  const chosen = keep !== null && options.includes(keep) ? keep : options[options.length - 1] ?? null;
  const release = async () => {
    if (chosen === null) return;
    const ok = await confirm({
      title: "Reduzir vagas extras?",
      message: `Você fica com ${chosen} ${chosen === 1 ? "vaga extra" : "vagas extras"} a partir da próxima renovação. Até lá, nada muda e não há devolução do que já foi pago.`,
      confirmLabel: "Reduzir na renovação",
    });
    if (!ok) return;
    setBusy("release");
    const err = await scheduleSeatRelease(chosen);
    setBusy(null);
    if (err) return void toast.error(err);
    toast.success("Redução agendada.");
    await load();
    onChanged?.();
  };
  const undo = async () => {
    setBusy("undo");
    const err = await undoSeatRelease();
    setBusy(null);
    if (err) return void toast.error(err);
    toast.success("Redução desfeita.");
    await load();
    onChanged?.();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-bold text-lg">Vagas de equipe</h2>
        <Badge tone="muted">{st.included + st.extra} no total</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Incluídas no plano: <strong>{st.included}</strong>. Vagas extras: <strong>{st.extra}</strong>. Em uso: <strong>{st.inUse}</strong>.
      </p>
      {st.releaseOn && st.releaseTo !== null && (
        <div className="rounded-xl border border-border p-3 text-sm space-y-2">
          <p>Redução agendada: a casa passa a ter <strong>{st.releaseTo}</strong> {st.releaseTo === 1 ? "vaga extra" : "vagas extras"} em <strong>{dateBR(st.releaseOn)}</strong>. Até lá, tudo continua como está.</p>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void undo()}>{busy === "undo" ? "Desfazendo…" : "Desfazer redução"}</Button>
        </div>
      )}
      {canBuySeat(st) && st.quote ? (
        <div className="space-y-2">
          <p className="text-sm">
            Vaga extra: <strong>{formatCents(st.quote.monthlyCents)}/mês</strong>. Hoje você paga só os {st.quote.daysLeft} dias que faltam até a renovação
            {st.quote.cycleEnd ? ` (${dateBR(st.quote.cycleEnd)})` : ""}: <strong>{formatCents(st.quote.amountCents)}</strong>. A partir daí a vaga entra na sua fatura mensal de vagas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" disabled={busy !== null} onClick={() => void buy("pix")}>{busy === "pix" ? "Abrindo…" : `Contratar com Pix (${formatCents(st.quote.amountCents)})`}</Button>
            <Button variant="outline" disabled={busy !== null} onClick={() => void buy("card")}>{busy === "card" ? "Abrindo…" : "Contratar com cartão"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">A vaga é liberada quando o pagamento é confirmado. Você pode pedir o reembolso integral desta primeira contratação em até 7 dias, em Pedidos e validações. As renovações mensais não têm reembolso.</p>
        </div>
      ) : st.blocked ? (
        <p className="text-sm text-muted-foreground">{st.blocked}</p>
      ) : null}
      {st.extra > 0 && !st.releaseOn && options.length > 0 && chosen !== null && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Manter</span>
          <select className="rounded-xl border border-border bg-background px-2 py-1" value={chosen} onChange={(e) => setKeep(Number(e.target.value))} aria-label="Quantas vagas extras manter">
            {options.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <span>{chosen === 1 ? "vaga extra" : "vagas extras"} na próxima renovação</span>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void release()}>{busy === "release" ? "Agendando…" : "Reduzir"}</Button>
        </div>
      )}
      {st.extra > 0 && !st.releaseOn && options.length === 0 && (
        <p className="text-xs text-muted-foreground">Para reduzir vagas, primeiro remova pessoas da equipe: há mais gente do que vagas.</p>
      )}
    </Card>
  );
}
