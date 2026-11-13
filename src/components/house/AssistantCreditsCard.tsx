import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Progress } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { buyCredits, fetchCredits, fetchRefunds, requestRefund } from "@/lib/aiCredits";
import { expiryText, franchiseView, offerLabel, refundText, statusText, type Credits, type PackKey, type Refunds } from "@/lib/aiCreditsCore";
import { formatCents } from "@/lib/financePanelCore";

/** Respostas da assistente: franquia do mês, créditos comprados (validade de 3 meses, com reembolso em até 7 dias) e compra de pacotes. */
export default function AssistantCreditsCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { isRemoteAuth } = useApp();
  const [c, setC] = useState<Credits | null>(null);
  const [busy, setBusy] = useState<PackKey | null>(null);
  const [refunds, setRefunds] = useState<Refunds | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchCredits().then((r) => alive && setC(r));
    void fetchRefunds().then((r) => alive && setRefunds(r));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, refreshKey, version]);

  const refund = async (chargeId: string, money: string) => {
    if (!window.confirm(`Pedir o reembolso de ${money}? Os créditos não usados deste pacote serão retirados do seu saldo.`)) return;
    setRefunding(chargeId);
    const r = await requestRefund(chargeId);
    setRefunding(null);
    if (r.error) toast.error(r.error);
    else toast.success(r.pending ? "Reembolso pedido. O estorno está a caminho e será confirmado em instantes." : "Reembolso aprovado. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.");
    setVersion((n) => n + 1);
  };

  const f = franchiseView(c);
  if (!c || !f) return null; // plano sem assistente: nada a mostrar aqui

  const buy = async (k: PackKey) => {
    setBusy(k);
    const err = await buyCredits(k);
    if (err) {
      setBusy(null);
      toast.error(err);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display font-bold text-lg flex-1">Respostas da assistente</h2>
        <Badge tone={f.tone}>{f.exhausted ? "Franquia esgotada" : `${f.pct}% da franquia`}</Badge>
      </div>
      <Progress value={f.pct} tone={f.tone === "danger" ? "primary" : f.tone === "gold" ? "gold" : "forest"} />
      <p className="text-sm">{statusText(c)}</p>
      <p className="text-xs text-muted-foreground">
        Franquia do mês: {f.used} de {f.limit} respostas (não acumula para o mês seguinte). Os créditos comprados só são usados depois que a franquia acaba, começando pelo pacote mais antigo.
      </p>
      {c.packs.length > 0 && (
        <ul className="text-sm divide-y divide-border">
          {c.packs.map((p) => (
            <li key={p.expiresAt + p.size} className="py-1.5 flex flex-wrap gap-x-3">
              <span className="flex-1">Pacote de {p.size}: <strong>{p.remaining}</strong> restantes</span>
              <span className="text-xs text-muted-foreground">{expiryText(p.expiresAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {refunds && refunds.items.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-semibold">Reembolso de pacote</div>
          {refunds.items.map((i) => {
            const t = refundText(i);
            return (
              <div key={i.chargeId} className="space-y-1.5">
                <p className="text-sm">Pacote de {i.size}: {t.line}</p>
                <Button size="sm" variant="outline" disabled={refunding !== null} onClick={() => void refund(i.chargeId, t.money)}>
                  {refunding === i.chargeId ? "Pedindo…" : `Pedir reembolso de ${t.money}`}
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Até {refunds.windowDays} dias depois do pagamento você pode desistir da compra. Devolvemos o valor proporcional às respostas ainda não usadas do pacote (a franquia do mês é usada primeiro), sem descontar tarifa.</p>
        </div>
      )}
      {refunds && refunds.history.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {refunds.history.map((h) => `Reembolso de R$ ${(h.amountCents / 100).toFixed(2).replace(".", ",")} (${h.credits} respostas): ${h.status === "concluido" ? "concluído" : "a caminho"}`).join(" · ")}
        </p>
      )}
      {c.forSale && c.offers.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Comprar créditos</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {c.offers.map((o) => (
              <Button key={o.key} variant="outline" disabled={busy !== null} onClick={() => buy(o.key)} className="flex-col h-auto py-3">
                <span className="font-semibold">{offerLabel(o)}</span>
                <span className="text-sm">{busy === o.key ? "Abrindo…" : formatCents(o.priceCents)}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Pagamento por Pix ou cartão. O crédito entra assim que o pagamento é confirmado e vale por 3 meses a partir da compra; depois disso o saldo restante zera. Você pode desistir em até 7 dias e receber de volta o valor das respostas não usadas.
          </p>
        </div>
      )}
    </Card>
  );
}
