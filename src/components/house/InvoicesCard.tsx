import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchBillingStatus, fetchInvoices, type InvoiceRow } from "@/lib/platformBilling";
import { kindLabel, shortDate, statusLabel, statusTone } from "@/lib/platformBillingCore";
import { formatCents } from "@/lib/financePanelCore";

/** Faturas da plataforma para a casa (planos, vagas, destaque...). Só aparece quando a casa já tem alguma. */
export default function InvoicesCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { isRemoteAuth } = useApp();
  const [rows, setRows] = useState<InvoiceRow[]>([]);

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

  if (rows.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-lg">Faturas da plataforma</h2>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex-1 min-w-40">{r.description ?? kindLabel(r.kind)}</span>
            <span className="text-xs text-muted-foreground">vence {shortDate(r.dueDate)}</span>
            <span className="font-semibold">{formatCents(r.amountCents)}</span>
            <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
