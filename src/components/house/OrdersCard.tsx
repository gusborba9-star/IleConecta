import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchPlanRefund, fetchRefunds, fetchSeatRefunds, requestPlanRefund, requestRefund, requestSeatRefund } from "@/lib/aiCredits";
import { fetchMyPromotions, requestPromoRefund } from "@/lib/promotions";
import { promoName, promoRefundText, type MyPromo } from "@/lib/promotionsCore";
import { formatMoney } from "@/lib/pricing";
import { RETURNING_REFUND_TEXT, planRefundText, refundText, seatRefundText, type PlanRefund, type Refunds, type SeatRefunds } from "@/lib/aiCreditsCore";

/**
 * Pedidos e validações: compras recentes da casa e as solicitações ligadas a elas (cancelar a compra e pedir o reembolso dentro de 7 dias).
 * Fica recolhido e sem destaque de propósito: o caminho existe e é fácil de achar, sem induzir o pedido. O prazo e o caminho estão escritos nos Termos.
 */
export default function OrdersCard({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const { isRemoteAuth } = useApp();
  const [refunds, setRefunds] = useState<Refunds | null>(null);
  const [plan, setPlan] = useState<PlanRefund | null>(null);
  const [seats, setSeats] = useState<SeatRefunds | null>(null);
  const [promos, setPromos] = useState<MyPromo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchRefunds().then((r) => alive && setRefunds(r));
    void fetchPlanRefund().then((r) => alive && setPlan(r));
    void fetchSeatRefunds().then((r) => alive && setSeats(r));
    void fetchMyPromotions().then((r) => alive && setPromos(r.items.filter((i) => i.refundCents !== null && i.chargeId)));
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

  const cancelPromo = async (i: MyPromo) => {
    if (!i.chargeId || i.refundCents === null) return;
    if (!window.confirm(`Cancelar os dias que ainda não começaram e pedir o reembolso de ${formatMoney(i.refundCents / 100)}? O dia que já está em andamento continua até o fim.`)) return;
    setBusy(i.chargeId);
    const r = await requestPromoRefund(i.chargeId);
    setBusy(null);
    if (r.error) toast.error(r.error);
    else toast.success(r.pending ? "Pedido registrado. O estorno está a caminho e será confirmado em instantes." : "Pedido aprovado. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.");
    onChanged?.();
    setPromos((await fetchMyPromotions()).items.filter((x) => x.refundCents !== null && x.chargeId));
  };

  const cancelPlan = async (chargeId: string, money: string) => {
    if (!window.confirm(`Cancelar a assinatura e pedir o reembolso de ${money}? A casa volta ao plano Grátis (os dados são mantidos) e a cobrança mensal será encerrada. Este pedido vale uma única vez por casa.`)) return;
    setBusy(chargeId);
    const r = await requestPlanRefund(chargeId);
    setBusy(null);
    if (r.error) toast.error(r.error);
    else toast.success(r.pending ? "Pedido registrado. O estorno está a caminho e será confirmado em instantes." : "Pedido aprovado. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.");
    onChanged?.();
    setPlan(await fetchPlanRefund());
  };

  const cancelSeat = async (chargeId: string, money: string) => {
    if (!window.confirm(`Cancelar a vaga extra e pedir o reembolso de ${money}? A vaga é retirada da casa assim que o estorno for aprovado. Este pedido vale só para a primeira contratação desta vaga.`)) return;
    setBusy(chargeId);
    const r = await requestSeatRefund(chargeId);
    setBusy(null);
    if (r.error) toast.error(r.error);
    else toast.success(r.pending ? "Pedido registrado. O estorno está a caminho e será confirmado em instantes." : "Pedido aprovado. O dinheiro volta pelo mesmo meio de pagamento em alguns dias.");
    onChanged?.();
    setSeats(await fetchSeatRefunds());
  };

  if (!refunds) return null;
  const seatItems = seats?.items ?? [];
  const seatHistory = seats?.history ?? [];
  const planOffer = plan?.eligible ? plan : null;
  const planHistory = plan?.history ?? [];
  const returningNote = plan?.refundBlocked === true && plan.chargeId !== null && Date.parse(plan.deadline) > Date.now();
  const empty = seatItems.length === 0 && seatHistory.length === 0 && promos.length === 0 && refunds.items.length === 0 && refunds.history.length === 0 && !planOffer && planHistory.length === 0 && !plan?.cancelled && !returningNote;
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
          {plan?.cancelled && <p className="text-sm rounded-lg border border-border p-3">A assinatura desta casa foi cancelada com reembolso e a casa voltou ao plano Grátis. Para ter os recursos de um plano pago de novo, assine em Planos.</p>}
          {returningNote && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold list-none">Assinatura do plano: primeiro pagamento</summary>
              <p className="mt-2 text-sm">{RETURNING_REFUND_TEXT}</p>
            </details>
          )}
          {planOffer && planOffer.chargeId && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold list-none">Assinatura do plano: primeiro pagamento</summary>
              <div className="mt-2 space-y-2">
                <p className="text-sm">{planRefundText(planOffer).line}</p>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void cancelPlan(planOffer.chargeId as string, planRefundText(planOffer).money)}>
                  {busy === planOffer.chargeId ? "Enviando…" : "Cancelar assinatura e solicitar reembolso"}
                </Button>
                <p className="text-xs text-muted-foreground">Até {planOffer.windowDays} dias depois do primeiro pagamento, uma única vez por casa. Devolvemos o valor integral pelo mesmo meio de pagamento. A casa volta ao plano Grátis e a cobrança mensal é encerrada; os créditos de IA têm reembolso próprio.</p>
              </div>
            </details>
          )}
          {seatItems.map((i) => (
            <details key={i.chargeId} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold list-none">Vaga extra de equipe: primeira contratação</summary>
              <div className="mt-2 space-y-2">
                <p className="text-sm">{seatRefundText(i).line}</p>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void cancelSeat(i.chargeId, seatRefundText(i).money)}>
                  {busy === i.chargeId ? "Enviando…" : "Cancelar vaga e solicitar reembolso"}
                </Button>
                <p className="text-xs text-muted-foreground">Até {seats?.windowDays ?? 7} dias depois do pagamento da contratação. Devolvemos o valor integral pelo mesmo meio de pagamento e a vaga é retirada. As renovações mensais da vaga não têm reembolso. Se houver mais pessoas na equipe do que vagas, remova-as antes.</p>
              </div>
            </details>
          ))}
          {promos.map((i) => (
            <details key={i.id} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold list-none">{promoName(i)}</summary>
              <div className="mt-2 space-y-2">
                <p className="text-sm">{promoRefundText(i, (c) => formatMoney(c / 100))}</p>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void cancelPromo(i)}>
                  {busy === i.chargeId ? "Enviando…" : "Cancelar dias não iniciados e solicitar reembolso"}
                </Button>
                <p className="text-xs text-muted-foreground">Até 7 dias depois do pagamento. Devolvemos o valor proporcional aos dias que ainda não começaram, sem descontar tarifa. Cada dia é um bloco de 24 horas contado a partir do início.</p>
              </div>
            </details>
          ))}
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
          {seatHistory.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {seatHistory.map((h, k) => (
                <li key={`s-${h.at}-${k}`}>{`Reembolso da vaga extra de R$ ${(h.amountCents / 100).toFixed(2).replace(".", ",")}: ${h.status === "concluido" ? "concluído" : "a caminho"}`}</li>
              ))}
            </ul>
          )}
          {planHistory.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {planHistory.map((h, k) => (
                <li key={`p-${h.at}-${k}`}>{`Reembolso do plano de R$ ${(h.amountCents / 100).toFixed(2).replace(".", ",")}: ${h.status === "concluido" ? "concluído" : h.status === "falhou" ? "não concluído (assinatura mantida)" : "a caminho"}`}</li>
              ))}
            </ul>
          )}
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
