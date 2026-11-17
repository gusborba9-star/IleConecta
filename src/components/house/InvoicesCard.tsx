import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchBillingStatus, fetchInvoices, payCharge, type InvoiceRow } from "@/lib/platformBilling";
import { canPay, kindLabel, pixOffer, shortDate, statusLabel, statusTone } from "@/lib/platformBillingCore";
import { formatCents } from "@/lib/financePanelCore";

/** Faturas da plataforma para a casa (planos, vagas, destaque...). Só aparece quando a casa já tem alguma. */
export default function InvoicesCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { isRemoteAuth } = useApp();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // `?foco=<id da fatura>`: vem da central de pendências; só rola até a fatura e a destaca (não paga nada sozinho).
  const [params] = useSearchParams();
  const focus = params.get("foco");
  useEffect(() => {
    if (!focus || !rows.some((r) => r.id === focus)) return;
    document.getElementById(`fatura-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, rows]);

  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void (async () => {
      const s = await fetchBillingStatus();
      if (!s?.houseId) return;
      const list = await fetchInvoices(s.houseId);
      if (alive) setRows(list);
    })();
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, refreshKey]);

  const pay = async (id: string, method: "pix" | "card") => {
    setBusy(`${id}:${method}`);
    const error = await payCharge(id, method);
    if (error) {
      setBusy(null);
      toast.error(error);
    }
  };

  if (rows.length === 0) return null;
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // dia em Brasília (UTC-3)
  const offer = (r: InvoiceRow) => pixOffer(r, today);
  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-lg">Faturas da plataforma</h2>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} id={`fatura-${r.id}`} data-focused={focus === r.id ? "true" : undefined} className={`py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm${focus === r.id ? " rounded-lg bg-gold/10 px-2 ring-2 ring-gold/50" : ""}`}>
            <span className="flex-1 min-w-40">{r.description ?? kindLabel(r.kind)}</span>
            <span className="text-xs text-muted-foreground">vence {shortDate(r.dueDate)}</span>
            <span className="font-semibold">{formatCents(r.amountCents)}</span>
            <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
            {canPay({ status: r.status }) && (
              <span className="w-full flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="gold" disabled={busy !== null} onClick={() => void pay(r.id, "pix")}>{busy === `${r.id}:pix` ? "Abrindo…" : offer(r) ? `Pagar com Pix (${formatCents(offer(r)!.payCents)})` : "Pagar com Pix"}</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void pay(r.id, "card")}>{busy === `${r.id}:card` ? "Abrindo…" : "Pagar com cartão"}</Button>
                {offer(r) && <span className="text-xs text-muted-foreground">Pix com {offer(r)!.pct}% de desconto até {shortDate(offer(r)!.until)}. No cartão, valor cheio.</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
