import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchCardStatus, removeCard, setCardAuto, startCardSetup, type CardStatus } from "@/lib/platformBilling";
import { cardView } from "@/lib/platformBillingCore";

/** Cartão salvo para a cobrança automática da mensalidade e das vagas extras. A casa liga, desliga, troca e remove quando quiser. */
export default function CardAutoChargeCard({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const { isRemoteAuth } = useApp();
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus(await fetchCardStatus());
  }, []);
  useEffect(() => {
    if (isRemoteAuth) void load();
  }, [isRemoteAuth, refreshKey, load]);

  const run = async (key: string, action: () => Promise<string | null>, ok: string) => {
    setBusy(key);
    const error = await action();
    setBusy(null);
    if (error) toast.error(error);
    else {
      if (ok) toast.success(ok);
      await load();
      onChanged?.();
    }
  };

  const view = cardView(status);
  if (!view) return null;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <CreditCard className="h-5 w-5 mt-0.5 shrink-0 text-forest" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-bold text-lg">Cobrança automática no cartão</h2>
            {view.hasCard && <Badge tone={view.on ? "forest" : "muted"}>{view.on ? "Ligada" : "Desligada"}</Badge>}
          </div>
          <p className="text-sm font-semibold mt-2">{view.title}{view.expiry && <span className="font-normal text-muted-foreground"> · {view.expiry}</span>}</p>
          {view.expired && <p className="text-xs text-[hsl(var(--danger))] mt-1">Este cartão está vencido. Troque o cartão para a cobrança funcionar.</p>}
          <p className="text-sm text-muted-foreground mt-1">{view.summary}</p>
          {view.problem && <p role="alert" className="text-sm text-[hsl(var(--danger))] mt-2">{view.problem}</p>}
          {view.lastText && <p className="text-xs text-muted-foreground mt-2">{view.lastText}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            Ao cadastrar o cartão, você autoriza a cobrança da mensalidade do plano e das vagas extras de equipe nele, a cada vencimento, até desligar ou remover o cartão. O número do cartão fica só no provedor de pagamento. Você recebe um aviso 3 dias e 1 dia antes de cada cobrança.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!view.hasCard && <Button size="sm" variant="gold" disabled={busy !== null} onClick={() => void run("add", startCardSetup, "")}>{busy === "add" ? "Abrindo…" : "Cadastrar cartão"}</Button>}
            {view.hasCard && (
              <>
                <Button size="sm" variant={view.on ? "outline" : "gold"} disabled={busy !== null} onClick={() => void run("auto", () => setCardAuto(!view.on), view.on ? "Cobrança automática desligada." : "Cobrança automática ligada.")}>
                  {view.on ? "Desligar cobrança automática" : "Ligar cobrança automática"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("swap", startCardSetup, "")}>{busy === "swap" ? "Abrindo…" : "Trocar cartão"}</Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run("rm", removeCard, "Cartão removido.")}>Remover cartão</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

