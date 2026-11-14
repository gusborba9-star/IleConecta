import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, LifeBuoy, Lock, Power } from "lucide-react";
import { Button, Card } from "@/components/base";
import BillingAlertCard from "@/components/house/BillingAlertCard";
import ReactivateCard from "@/components/house/ReactivateCard";
import { downloadMyData } from "@/lib/accountGate";
import { lockCopy } from "@/lib/accountGateCore";
import type { AccountGate } from "@/lib/accountGateCore";
import type { PlanId } from "@/lib/pricing";

/**
 * Tela única da casa em bloqueio total ("Conta bloqueada", por falta de pagamento) ou inativa ("Conta inativa", assinatura encerrada).
 * Cada caso mostra só o seu fluxo: bloqueada paga a pendência; inativa escolhe um plano e paga. A equipe só é avisada.
 * O servidor também impede qualquer gravação da casa nesse estado: esta tela é a porta de volta, não a única barreira.
 */
export default function AccountLockScreen({ gate, plan }: { gate: AccountGate; plan: PlanId | null }) {
  const copy = lockCopy(gate);
  const [busy, setBusy] = useState(false);
  const Icon = gate.state === "inativa" ? Power : Lock;
  const download = async () => {
    setBusy(true);
    const err = await downloadMyData();
    setBusy(false);
    if (err) toast.error(err);
  };
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-6">
      <Card role="alert" className="p-6 border-2 border-destructive/40">
        <div className="flex items-start gap-3">
          <Icon className="h-6 w-6 mt-0.5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-display font-bold text-2xl">{copy.title}</h1>
            <p className="text-sm mt-1">{copy.lead}</p>
          </div>
        </div>
      </Card>

      {copy.action === "desbloquear" && <BillingAlertCard />}
      {copy.action === "quitar" && <BillingAlertCard inactive />}
      {copy.action === "reativar" && <ReactivateCard plan={plan} />}

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link to="/suporte" className="inline-flex"><Button variant="outline" size="sm"><LifeBuoy className="h-4 w-4 mr-1.5" aria-hidden />Falar com a administração</Button></Link>
          <Button variant="outline" size="sm" onClick={() => void download()} disabled={busy}><Download className="h-4 w-4 mr-1.5" aria-hidden />{busy ? "Preparando…" : "Baixar meus dados"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Seus dados ficam guardados. O suporte atende pelo chat da Conecta e leva o caso à administração.</p>
      </Card>
    </div>
  );
}
