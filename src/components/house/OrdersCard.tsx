import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchRefunds, requestRefund } from "@/lib/aiCredits";
import { refundText, type Refunds } from "@/lib/aiCreditsCore";

/**
 * Pedidos e validações: compras recentes da casa e as solicitações ligadas a elas (cancelar a compra e pedir o reembolso dentro de 7 dias).
 * Fica recolhido e sem destaque de propósito: o caminho existe e é fácil de achar, sem induzir o pedido. O prazo e o caminho estão escritos nos Termos.
 */
export default function OrdersCard({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const { isRemoteAuth } = useApp();
  const [refunds, setRefunds] = useState<Refunds | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchRefunds().then((r) => alive && setRefunds(r));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, refreshKey]);

  const cancel = async (chargeId: string, money: string) => {
    if (!window.confirm(`Cancelar esta compra e pedir o reembolso de ${money}? Os créditos não usados deste pacote serão retirados do seu saldo.`)) return;
    setBusy(chargeId);
    const r = await requestRefund(chargeId);
    setBusy(null);
    if (r.error) toast.error(r.error);
    else toast.success(r.pending ? "Pedido registrado. O estorno está a caminho e será confirmado em instantes." : "Pedido aprovado. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.");
    onChanged?.();
  };

  if (!refunds) return null;
  const empty = refunds.items.length === 0 && refunds.history.length === 0;
  return (
    <Card className="p-5">
      <details>
        <summary className="flex cursor-pointer items-center gap-2 list-none">
          <ClipboardList className="h-5 w-5 shrink-0 text-forest" aria-hidden />
          <h2 className="font-display font-bold text-lg">Pedidos e validações</h2>
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">Suas compras recentes e as solicitações ligadas a elas.</p>
          {empty && <p className="text-sm text-muted-foreground">Nenhum pedido recente.</p>}
          {refunds.items.map((i) => {
            const t = refundText(i);
            return (
              <details key={i.chargeId} className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold list-none">Compra de créditos: pacote de {i.size} respostas</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-sm">{t.line}</p>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void cancel(i.chargeId, t.money)}>
                    {busy === i.chargeId ? "Enviando…" : "Cancelar compra e solicitar reembolso"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Até {refunds.windowDays} dias depois do pagamento. Devolvemos o valor proporcional às respostas ainda não usadas (a franquia do mês é usada primeiro), sem descontar tarifa, pelo mesmo meio de pagamento.</p>
                </div>
              </details>
            );
          })}
          {refunds.history.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {refunds.history.map((h, k) => (
                <li key={`${h.at}-${k}`}>{`Reembolso de R$ ${(h.amountCents / 100).toFixed(2).replace(".", ",")} (${h.credits} respostas): ${h.status === "concluido" ? "concluído" : "a caminho"}`}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </Card>
  );
}
