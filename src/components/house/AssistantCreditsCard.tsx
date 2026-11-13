import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Progress } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { buyCredits, fetchCredits } from "@/lib/aiCredits";
import { expiryText, franchiseView, offerLabel, statusText, type Credits, type PackKey } from "@/lib/aiCreditsCore";
import { formatCents } from "@/lib/financePanelCore";

/** Respostas da assistente: franquia do mês, créditos comprados (validade de 3 meses, com reembolso em até 7 dias) e compra de pacotes. */
export default function AssistantCreditsCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { isRemoteAuth } = useApp();
  const [c, setC] = useState<Credits | null>(null);
  const [busy, setBusy] = useState<PackKey | null>(null);

  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchCredits().then((r) => alive && setC(r));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, refreshKey]);

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
