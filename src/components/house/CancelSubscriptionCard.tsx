import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { cancelSubscription, fetchCancelStatus, undoCancel, type CancelMode } from "@/lib/accountGate";
import { brDate, cancelChoices, cancelDoneText, type CancelStatus } from "@/lib/accountGateCore";

/**
 * Cancelar a assinatura (discreto, em Planos). Passo 1: "Quer mesmo cancelar?". Passo 2: usar até o vencimento ou cancelar agora.
 * Cancelamento agendado pode ser desfeito até o dia. Fatura em atraso não deixa cancelar (a dívida não some).
 */
export default function CancelSubscriptionCard({ onChanged }: { onChanged?: () => void }) {
  const { isRemoteAuth } = useApp();
  const [st, setSt] = useState<CancelStatus | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [mode, setMode] = useState<CancelMode>("vencimento");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { const s = await fetchCancelStatus(); if (s) setSt(s); }, []);
  useEffect(() => { if (isRemoteAuth) void load(); }, [isRemoteAuth, load]);

  if (!isRemoteAuth || !st) return null;
  if (!st.canCancel && !st.scheduled) {
    // casa sem assinatura ativa não tem o que cancelar; fatura em atraso/pagamento em processamento mostra o motivo
    return st.reason && !/já está cancelada|não tem assinatura|ainda não está ativa/.test(st.reason) ? (
      <Card className="p-4"><p className="text-xs text-muted-foreground"><strong>Cancelar assinatura:</strong> {st.reason}</p></Card>
    ) : null;
  }

  if (st.scheduled) {
    const undo = async () => {
      setBusy(true);
      const err = await undoCancel();
      setBusy(false);
      if (err) return void toast.error(err);
      toast.success("Cancelamento desfeito. Sua assinatura continua.");
      await load(); onChanged?.();
    };
    return (
      <Card role="status" className="p-4 border-gold/50 bg-gold/10">
        <p className="text-sm"><strong>Cancelamento agendado para {brDate(st.cancelAt)}.</strong> Até lá você usa tudo normalmente. Nesse dia a casa fica inativa e não há nova cobrança.</p>
        <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void undo()}>Desfazer cancelamento</Button>
      </Card>
    );
  }

  const confirm = async () => {
    setBusy(true);
    const r = await cancelSubscription(mode);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(cancelDoneText({ mode: r.mode, cancelAt: r.cancelAt }));
    setStep(0);
    await load(); onChanged?.();
    // cancelar agora deixa a casa inativa: a tela única assume na próxima checagem
    if (r.mode === "agora") window.location.assign("/");
  };

  const choices = cancelChoices(st);
  return (
    <Card className="p-4">
      {step === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Precisa encerrar a assinatura? Sem multa.</p>
          <Button size="sm" variant="ghost" onClick={() => setStep(1)}>Cancelar assinatura</Button>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <h2 className="font-display font-bold text-base">Quer mesmo prosseguir com o cancelamento?</h2>
          <p className="text-sm text-muted-foreground">Seus dados ficam guardados e você pode voltar quando quiser, pagando um plano.</p>
          <div className="flex gap-2"><Button size="sm" variant="danger" onClick={() => setStep(2)}>Sim, continuar</Button><Button size="sm" variant="outline" onClick={() => setStep(0)}>Não, manter</Button></div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <h2 className="font-display font-bold text-base">Como você quer cancelar?</h2>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Como cancelar">
            {choices.map((c) => (
              <button key={c.mode} type="button" role="radio" aria-checked={mode === c.mode} onClick={() => setMode(c.mode)} className={`rounded-xl border p-3 text-left text-sm ${mode === c.mode ? "border-forest bg-forest/10 ring-2 ring-forest" : "border-border bg-card"}`}>
                <span className="block font-semibold">{c.title}{c.mode === "vencimento" ? " (recomendado)" : ""}</span>
                <span className="block text-xs text-muted-foreground mt-1">{c.text}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Dentro dos 7 dias do primeiro pagamento do plano, você pode pedir o reembolso integral em “Pedidos e validações”.</p>
          <div className="flex gap-2"><Button size="sm" variant="danger" disabled={busy} onClick={() => void confirm()}>{busy ? "Cancelando…" : mode === "agora" ? "Cancelar agora" : "Agendar cancelamento"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setStep(0)}>Voltar</Button></div>
        </div>
      )}
    </Card>
  );
}
