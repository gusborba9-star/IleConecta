import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card } from "@/components/base";
import { paymentsEnabledFor } from "@/lib/consents";
import { fetchAccountStatus, startOnboarding, type AccountStatus } from "@/lib/payments";

interface Props { ownerId: string; termsOk: boolean }

/** Cadastro de recebimento da casa no Stripe. Só aparece quando os pagamentos estão liberados para esta casa. */
export default function PaymentAccountCard({ ownerId, termsOk }: Props) {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetchAccountStatus();
    if (typeof s === "string") toast.error(s);
    else setStatus(s);
  }, []);

  useEffect(() => {
    let alive = true;
    void paymentsEnabledFor(ownerId).then((v) => {
      if (!alive) return;
      setOn(v);
      if (v) void refresh();
    });
    return () => {
      alive = false;
    };
  }, [ownerId, refresh]);

  if (!on) return null;

  const go = async () => {
    setBusy(true);
    const error = await startOnboarding();
    if (error) {
      setBusy(false);
      toast.error(error);
    }
  };

  const ready = status?.chargesEnabled;
  return (
    <Card className="p-5 border-gold/50">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display font-bold text-lg">Recebimento pela plataforma</h2>
        {status && (ready ? <Badge tone="forest">Ativo</Badge> : <Badge tone="gold">{status.registered ? "Cadastro em andamento" : "Não cadastrado"}</Badge>)}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {ready
          ? "Você já pode vender rituais e serviços pela plataforma. O valor pago cai direto na sua conta Stripe, já sem a comissão da plataforma."
          : "Para vender pela plataforma, cadastre a sua conta de recebimento no Stripe (dados e conta bancária). O dinheiro vai direto para você; a plataforma só retém a comissão."}
      </p>
      {!termsOk && <p className="text-sm text-[hsl(var(--danger))] mt-2">Aceite antes os Termos de Uso da Casa.</p>}
      {!ready && <Button className="mt-3" disabled={busy || !termsOk} onClick={() => void go()}>{busy ? "Abrindo…" : status?.registered ? "Continuar cadastro" : "Cadastrar recebimento"}</Button>}
      {status?.registered && !ready && <Button className="mt-3 ml-2" variant="outline" onClick={() => void refresh()}>Atualizar situação</Button>}
    </Card>
  );
}
