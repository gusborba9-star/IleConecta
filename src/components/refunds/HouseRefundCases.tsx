import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Textarea } from "@/components/base";
import { fetchHouseOpenRefunds, respondRefund, subscribeRefunds, type RefundRequest } from "@/lib/refunds";
import { formatCents } from "@/lib/servicesCore";

/** Na página da própria casa: relatos de clientes em análise, com campo para a casa dar a sua versão. */
export default function HouseRefundCases({ ownerId }: { ownerId: string }) {
  const [rows, setRows] = useState<RefundRequest[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setRows(await fetchHouseOpenRefunds(ownerId)), [ownerId]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void load();
    return subscribeRefunds(() => void loadRef.current());
  }, [load]);

  if (rows.length === 0) return null;

  const send = async (r: RefundRequest) => {
    setBusy(r.id);
    const error = await respondRefund(r.id, texts[r.id] ?? "");
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Resposta enviada. A equipe vai analisar as duas versões.");
    await load();
  };

  return (
    <Card className="p-5 mt-4 border-gold/60">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-bold text-lg flex-1">Relatos de clientes em análise</h2>
        <Badge tone="gold">{rows.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Um cliente relatou problema com a entrega. A equipe decide com a versão dele e a sua: conte o que foi combinado e o que foi entregue.
      </p>
      <div className="mt-4 space-y-5">
        {rows.map((r) => (
          <div key={r.id} className="border-t border-border/60 pt-4 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{r.clientName}</strong>
              <span className="ml-auto text-sm font-semibold">{formatCents(r.amountCents)}</span>
            </div>
            {r.reason && <p className="text-sm mt-1 whitespace-pre-line"><span className="text-muted-foreground">Relato do cliente: </span>{r.reason}</p>}
            {r.houseResponse ? (
              <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Sua resposta (enviada à equipe)</div>
                <p className="whitespace-pre-line">{r.houseResponse}</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={3}
                  maxLength={700}
                  value={texts[r.id] ?? ""}
                  onChange={(e) => setTexts((t) => ({ ...t, [r.id]: e.target.value }))}
                  placeholder="Sua versão: o que foi combinado, o que foi entregue e quando (mínimo de 10 caracteres)."
                />
                <Button size="sm" disabled={busy === r.id || (texts[r.id] ?? "").trim().length < 10} onClick={() => void send(r)}>
                  {busy === r.id ? "Enviando…" : "Enviar resposta"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
