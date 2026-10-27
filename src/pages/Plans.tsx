import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchMyAssistant } from "@/lib/assistant";
import { PLANS, formatMoney, type PlanId } from "@/lib/pricing";
import { PEOPLE_FOR_24H, staffCost, staffMultiple } from "@/lib/pricingCore";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { useNavigate } from "react-router-dom";

/** Quanto custaria pessoas para o mesmo atendimento. Calculado com os preços atuais dos planos. */
function ComparisonCard({ rows }: { rows: { plan: PlanId; people: number; label: string }[] }) {
  const { config } = usePlatformConfig();
  const shown = rows.flatMap((r) => {
    const info = config.pricing.plans[r.plan];
    const times = staffMultiple(info.monthly, r.people);
    return times === null ? [] : [{ ...r, name: info.name, times }];
  });
  if (shown.length === 0) return null;
  return (
    <Card className="p-6">
      <h2 className="font-display font-bold text-xl">Quanto custaria uma pessoa para fazer isso?</h2>
      <p className="text-sm text-muted-foreground mt-1">Receber, informar e orientar os seus clientes, todos os dias.</p>
      <ul className="mt-4 space-y-3 text-sm">
        {shown.map((r) => (
          <li key={r.plan} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="flex-1">{r.label}: <strong>{formatMoney(staffCost(r.people))}</strong> por mês só de salário.</span>
            <Badge tone="gold">Cerca de {r.times} vezes o plano {r.name}</Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground mt-4">
        Estimativa referencial com base na média salarial de assistente de atendimento no Brasil (cerca de R$ 2.000 por mês; fontes: Glassdoor e Catho, consulta em outubro de 2026), considerando só o salário, sem encargos, férias nem 13º. Os custos reais variam conforme a região e o regime de contratação. Compara só o atendimento; o trabalho espiritual continua sendo da casa.
      </p>
    </Card>
  );
}

export default function Plans() {
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const { config } = usePlatformConfig();
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
          Escolha o plano da sua casa. Quando o pagamento pela plataforma estiver disponível: rituais com vagas têm taxa de 17% e serviços contratados pela plataforma têm 5% no Pix. Atendimentos combinados direto com a casa não têm taxa da plataforma.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {PLANS.map((p) => {
          const info = config.pricing.plans[p.id];
          return (
          <Card key={p.id} className={`p-5 flex flex-col ${mine === p.id ? "border-primary" : ""}`}>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-xl flex-1">{info.name}</h2>
              {mine === p.id && <Badge tone="primary">Seu plano</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{p.tagline}</p>
            <div className="mt-3">
              <span className="font-display font-bold text-2xl text-primary">{formatMoney(info.monthly)}</span>
              {info.monthly !== null && <span className="text-sm text-muted-foreground"> / mês</span>}
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
          );
        })}
      </div>
      <ComparisonCard
        rows={[
          { plan: "intermediario", people: 1, label: "Uma pessoa para atender em horário comercial" },
          { plan: "maximo", people: PEOPLE_FOR_24H, label: `Uma equipe de cerca de ${PEOPLE_FOR_24H} pessoas para cobrir 24 horas, 7 dias por semana` },
        ]}
      />
      <p className="text-xs text-muted-foreground">A contratação de planos pela plataforma ainda não está disponível; por enquanto a troca é feita pelo suporte.</p>
    </div>
  );
}
