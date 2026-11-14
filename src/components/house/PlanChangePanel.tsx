import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { brDate } from "@/lib/accountGateCore";
import { schedulePlanDowngrade, undoPlanDowngrade } from "@/lib/planChange";
import { PLAN_RANK, type PlanChangeStatus } from "@/lib/planChangeCore";
import { startSubscribe, startUpgrade } from "@/lib/platformBilling";
import { formatMoney, type PlanId } from "@/lib/pricing";

const TERMS = <Link to="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Uso</Link>;

/**
 * Painel de troca de plano dentro de Planos. Três caminhos, todos decididos pelo banco (a tela só mostra valores e motivos):
 * assinar (casa sem assinatura), subir de plano (paga a diferença proporcional) e descer (vale na renovação, sem devolução).
 */
export default function PlanChangePanel({ status, target, onClose, onChanged }: { status: PlanChangeStatus; target: PlanId; onClose: () => void; onChanged: () => void }) {
  const { config } = usePlatformConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const name = (p: PlanId) => config.pricing.plans[p].name;
  const monthly = config.pricing.plans[target].monthly;
  const up = status.subscribed && PLAN_RANK[target] > PLAN_RANK[status.plan];
  const down = status.subscribed && PLAN_RANK[target] < PLAN_RANK[status.plan];
  const quote = up ? status.upgrades[target] : undefined;
  const blockedUp = up ? status.upgradeBlocked[target] : undefined;

  const pay = async (method: "pix" | "card") => {
    if (target === "base") return;
    setBusy(method);
    const error = await (up ? startUpgrade : startSubscribe)(target, method);
    if (error) { setBusy(null); toast.error(error); }
  };
  const schedule = async () => {
    if (target === "maximo") return;
    setBusy("agendar");
    const r = await schedulePlanDowngrade(target);
    setBusy(null);
    if (r.error) { toast.error(r.error); return; }
    toast.success(`Troca agendada para ${brDate(r.effectiveOn)}.`);
    onChanged();
    onClose();
  };
  const undo = async () => {
    setBusy("desfazer");
    const error = await undoPlanDowngrade();
    setBusy(null);
    if (error) { toast.error(error); return; }
    toast.success("Troca de plano desfeita.");
    onChanged();
  };

  return (
    <Card role="region" aria-label="Trocar de plano" className="p-5 border-2 border-forest/50">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-lg">
            {!status.subscribed ? `Assinar o plano ${name(target)}` : up ? `Subir para o plano ${name(target)}` : down ? `Passar para o plano ${name(target)}` : "Plano atual"}
          </h2>

          {!status.subscribed && target !== "base" && (
            <>
              <p className="text-sm mt-1">Você paga <strong>{formatMoney(monthly)}</strong> agora. Ao confirmar o pagamento, o plano é liberado na hora e a mensalidade passa a vencer neste mesmo dia, todo mês. Você cancela quando quiser, em Planos.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="gold" disabled={busy !== null} onClick={() => void pay("pix")}>{busy === "pix" ? "Abrindo…" : `Pagar ${formatMoney(monthly)} com Pix`}</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void pay("card")}>{busy === "card" ? "Abrindo…" : "Pagar com cartão"}</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Ao pagar, você contrata o plano e concorda com os {TERMS}. Em até 7 dias do primeiro pagamento você pode pedir o reembolso integral, em Pedidos e validações.</p>
            </>
          )}

          {up && quote && (
            <>
              <p className="text-sm mt-1">Hoje você paga só a diferença dos <strong>{quote.daysLeft} dias</strong> que faltam no ciclo: <strong>{formatMoney(quote.amountCents / 100)}</strong> (plano {name(status.plan)} {formatMoney(quote.oldCents / 100)} → {name(target)} {formatMoney(quote.newCents / 100)} por mês). Ao confirmar, os novos recursos são liberados na hora. O seu vencimento continua em <strong>{brDate(quote.cycleEnd)}</strong>, já com o valor do plano novo.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="gold" disabled={busy !== null} onClick={() => void pay("pix")}>{busy === "pix" ? "Abrindo…" : `Pagar ${formatMoney(quote.amountCents / 100)} com Pix`}</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void pay("card")}>{busy === "card" ? "Abrindo…" : "Pagar com cartão"}</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Ao pagar, você concorda com os {TERMS}. Este pagamento não tem novo reembolso de 7 dias.</p>
            </>
          )}
          {up && !quote && <p className="text-sm mt-1">{blockedUp ?? "A troca para este plano não está disponível agora."}</p>}

          {down && status.pendingPlan === target && (
            <>
              <p className="text-sm mt-1">Troca agendada: você mantém o plano {name(status.plan)} até <strong>{brDate(status.pendingOn)}</strong> e, nessa renovação, passa para o plano {name(target)}.</p>
              <div className="mt-3"><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void undo()}>{busy === "desfazer" ? "Desfazendo…" : "Desfazer a troca"}</Button></div>
            </>
          )}
          {down && status.pendingPlan !== target && (
            status.downgradeBlocked ? <p className="text-sm mt-1">{status.downgradeBlocked}</p> : (
              <>
                <p className="text-sm mt-1">{target === "base"
                  ? "A casa volta ao plano Base na próxima renovação e a mensalidade deixa de ser cobrada."
                  : `A casa passa para o plano ${name(target)} (${formatMoney(monthly)} por mês) na próxima renovação.`} Até lá você continua com os recursos do plano {name(status.plan)}. Não há devolução de dias já pagos.</p>
                <div className="mt-3"><Button size="sm" variant="gold" disabled={busy !== null} onClick={() => void schedule()}>{busy === "agendar" ? "Agendando…" : "Agendar a troca"}</Button></div>
                <p className="text-xs text-muted-foreground mt-2">Você pode desfazer enquanto a fatura da renovação ainda não tiver sido gerada. Equipe acima do limite do plano novo fica desativada, sem apagar nada.</p>
              </>
            )
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
    </Card>
  );
}
