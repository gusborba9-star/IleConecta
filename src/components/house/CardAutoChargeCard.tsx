import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { authorizeAutoCharge, fetchCardStatus, removeCard, setCardAuto, startCardSetup, type CardStatus } from "@/lib/platformBilling";
import { authorizationText, cardView } from "@/lib/platformBillingCore";

/** Cartão salvo para a cobrança automática da mensalidade e das vagas extras. A casa liga, desliga, troca e remove quando quiser. */
export default function CardAutoChargeCard({ refreshKey = 0, onChanged, planName = null, monthly = null }: { refreshKey?: number; onChanged?: () => void; planName?: string | null; monthly?: number | null }) {
  const { isRemoteAuth } = useApp();
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const checkId = useId();

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

  const auth = authorizationText({ planName, amountCents: monthly !== null && Number.isFinite(monthly) ? Math.round(monthly * 100) : null });
  /** Registra a autorização marcada (a caixa começa desmarcada) e só então executa a ação; o servidor confere de novo. */
  const withAuth = async (key: string, action: () => Promise<string | null>, ok: string) => {
    if (!agreed) return void toast.error("Marque a autorização de cobrança automática para continuar.");
    setBusy(key);
    const error = await authorizeAutoCharge(auth);
    setBusy(null);
    if (error) return void toast.error(error);
    await run(key, action, ok);
    setAgreed(false);
    setSwapping(false);
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
            O número do cartão fica só no provedor de pagamento. Você recebe um aviso 3 dias e 1 dia antes de cada cobrança.
          </p>
          {(!view.hasCard || !view.on || swapping) && (
            <div className="mt-3 rounded-md border border-border p-3">
              <label htmlFor={checkId} className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer">
                <input id={checkId} type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>{auth.text}</span>
              </label>
              <div className="mt-2 text-xs">
                <Link to="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver os Termos de Uso</Link>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!view.hasCard && <Button size="sm" variant="gold" disabled={busy !== null || !agreed} onClick={() => void withAuth("add", startCardSetup, "")}>{busy === "add" ? "Abrindo…" : "Cadastrar cartão"}</Button>}
            {view.hasCard && (
              <>
                {view.on ? (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("auto", () => setCardAuto(false), "Cobrança automática desligada.")}>Desligar cobrança automática</Button>
                ) : (
                  <Button size="sm" variant="gold" disabled={busy !== null || !agreed} onClick={() => void withAuth("auto", () => setCardAuto(true), "Cobrança automática ligada.")}>Ligar cobrança automática</Button>
                )}
                {view.on && !swapping ? (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setSwapping(true)}>Trocar cartão</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy !== null || !agreed} onClick={() => void withAuth("swap", startCardSetup, "")}>{busy === "swap" ? "Abrindo…" : "Trocar cartão"}</Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run("rm", removeCard, "Cartão removido.")}>Remover cartão</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

