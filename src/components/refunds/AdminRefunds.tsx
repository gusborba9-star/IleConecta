import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Textarea } from "@/components/base";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { completeRefund, decideRefund, fetchRefundQueue, subscribeRefunds, type RefundRequest } from "@/lib/refunds";
import { formatCents } from "@/lib/servicesCore";

/** Fila de reembolsos: decidir pedidos e registrar o estorno depois que o dinheiro voltou ao cliente. */
export default function AdminRefunds() {
  const { isAdmin } = usePlatformConfig();
  const [rows, setRows] = useState<RefundRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setRows(await fetchRefundQueue()), []);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const stop = subscribeRefunds(() => void loadRef.current());
    return stop;
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const run = async (id: string, fn: () => Promise<string | null>, okMsg: string) => {
    setBusy(id);
    const error = await fn();
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success(okMsg);
    await load();
  };

  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-xl">Reembolsos</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Pedidos depois do início ficam aqui. Aprovar avisa o cliente e a casa; o repasse fica retido. Depois de devolver o dinheiro pelo meio de pagamento, clique em “Registrar estorno” para atualizar o razão e o repasse.
      </p>
      {rows === null && <p className="text-sm text-muted-foreground mt-4">Carregando…</p>}
      {rows !== null && rows.length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum pedido em aberto.</p>}
      <div className="mt-4 space-y-4">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="border-t border-border/60 pt-4 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{r.clientName}</strong>
              <span className="text-muted-foreground text-sm">→ {r.houseName}</span>
              <Badge tone={r.status === "pendente" ? "gold" : "primary"}>{r.status === "pendente" ? "Para decidir" : "Aprovado: aguardando estorno"}</Badge>
              <span className="text-sm ml-auto font-semibold">{formatCents(r.amountCents)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {r.reservationId ? "Vaga em ritual" : "Pedido de serviço"} · {r.kind === "antes_do_inicio" ? "cancelado antes do início" : "pedido depois do início"} · {new Date(r.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </div>
            {r.reason && <p className="text-sm mt-2 whitespace-pre-line">{r.reason}</p>}
            {r.status === "pendente" ? (
              <div className="mt-3 space-y-2">
                <Textarea rows={2} maxLength={800} value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="Justificativa (obrigatória para recusar; o cliente lê)" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy === r.id} onClick={() => void run(r.id, () => decideRefund(r.id, true, notes[r.id] ?? ""), "Reembolso aprovado. Cliente e casa foram avisados.")}>Aprovar</Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void run(r.id, () => decideRefund(r.id, false, notes[r.id] ?? ""), "Pedido recusado. Cliente e casa foram avisados.")}>Recusar</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <Button
                  size="sm"
                  disabled={busy === r.id}
                  onClick={() => { if (window.confirm("Confirma que o dinheiro já foi devolvido ao cliente? Isso estorna o razão e o repasse da casa e não pode ser desfeito.")) void run(r.id, () => completeRefund(r.id), "Estorno registrado."); }}
                >
                  Registrar estorno
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
