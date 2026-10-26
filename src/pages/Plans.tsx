import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchMyAssistant } from "@/lib/assistant";
import { PLANS, formatMoney, type PlanId } from "@/lib/pricing";
import { useNavigate } from "react-router-dom";

export default function Plans() {
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const [mine, setMine] = useState<PlanId | null>(null);
  const isHouse = currentUser?.type === "commercial";
  const userId = currentUser?.id;

  useEffect(() => {
    if (!isRemoteAuth || !isHouse || !userId) return;
    let alive = true;
    fetchMyAssistant(userId).then((c) => alive && setMine(c?.plan ?? null));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, isHouse, userId]);

  return (
    <div className="space-y-6 pb-16 lg:pb-4">
      <Card className="p-6">
        <h1 className="font-display font-bold text-2xl">Planos</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Escolha o plano da sua casa. A taxa de 17% vale somente para eventos e rituais; búzios e trabalhos não têm taxa sobre a venda.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {PLANS.map((p) => (
          <Card key={p.id} className={`p-5 flex flex-col ${mine === p.id ? "border-primary" : ""}`}>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-xl flex-1">{p.name}</h2>
              {mine === p.id && <Badge tone="primary">Seu plano</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{p.tagline}</p>
            <div className="mt-3">
              <span className="font-display font-bold text-2xl text-primary">{formatMoney(p.monthly)}</span>
              {p.monthly !== null && <span className="text-sm text-muted-foreground"> / mês</span>}
            </div>
            <ul className="mt-4 space-y-2 text-sm flex-1">
              {p.benefits.map((b) => (
                <li key={b} className="flex gap-2"><Check className="h-4 w-4 text-forest shrink-0 mt-0.5" />{b}</li>
              ))}
            </ul>
            {isHouse ? (
              <Button className="w-full mt-5" variant="outline" disabled={mine === p.id} onClick={() => nav("/suporte")}>
                {mine === p.id ? "Plano atual" : "Fazer upgrade pelo suporte"}
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">A contratação de planos pela plataforma ainda não está disponível; por enquanto a troca é feita pelo suporte.</p>
    </div>
  );
}
