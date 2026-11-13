import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input } from "@/components/base";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { formatCents } from "@/lib/financePanelCore";
import { shortDate } from "@/lib/platformBillingCore";
import { PLANS } from "@/lib/pricing";
import { announcePriceChange, cancelPriceChange, fetchPriceChanges, type PriceChange } from "@/lib/billingAdmin";

const STATUS: Record<PriceChange["status"], string> = { anunciado: "Anunciado", aplicado: "Em vigor", cancelado: "Cancelado" };

/** Data mínima de vigência: hoje + 30 dias, no horário de Brasília. */
function minEffective(): string {
  const d = new Date(Date.now() + 30 * 864e5);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Atualização da tabela comercial: aumento de mensalidade com aviso de 30 dias. O aviso vai às casas matriculadas no plano (notificação e push),
 * a renovação com vencimento a partir da vigência sai com o valor novo e, na data, a tabela de preços recebe o valor novo.
 */
export default function PriceChangeCard() {
  const { config } = usePlatformConfig();
  const [items, setItems] = useState<PriceChange[]>([]);
  const [plan, setPlan] = useState<string>(PLANS[0].id);
  const [value, setValue] = useState("");
  const [eff, setEff] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setItems(await fetchPriceChanges()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const current = config.pricing.plans[plan as keyof typeof config.pricing.plans]?.monthly ?? null;
  const num = Number(value.replace(",", "."));
  const valid = Number.isFinite(num) && num > 0 && (current === null || num > current) && (eff === "" || eff >= minEffective());

  const announce = async () => {
    if (!window.confirm(`Anunciar o reajuste do plano ${config.pricing.plans[plan as keyof typeof config.pricing.plans].name} para R$ ${num.toFixed(2).replace(".", ",")} ${eff ? `a partir de ${shortDate(eff)}` : "com vigência daqui a 30 dias"}? Cada casa matriculada neste plano será avisada agora da data da sua primeira renovação com o valor novo.`)) return;
    setBusy("announce");
    const r = await announcePriceChange(plan, num, eff || null, reason);
    setBusy(null);
    if (r.error) toast.error(r.error);
    else {
      toast.success(`Reajuste anunciado. ${r.notified} casa(s) avisada(s).`);
      setValue("");
      setReason("");
      void load();
    }
  };
  const cancel = async (id: string) => {
    const why = window.prompt("Motivo do cancelamento do reajuste (mínimo de 10 caracteres):") ?? "";
    if (why.trim().length < 10) return;
    setBusy(id);
    const error = await cancelPriceChange(id, why);
    setBusy(null);
    if (error) toast.error(error);
    else {
      toast.success("Reajuste cancelado e as casas foram avisadas.");
      void load();
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h2 className="font-display font-bold text-lg">Atualização da tabela comercial</h2>
        <p className="text-xs text-muted-foreground">Aumento de mensalidade com aviso de 30 dias. Sem data, a vigência é daqui a 30 dias; cada casa muda na sua primeira renovação a partir da vigência. Redução de preço vale na hora, direto na tabela de preços. Com a cobrança ligada, aumento direto na tabela é recusado.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">Plano
          <select className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => <option key={p.id} value={p.id}>{config.pricing.plans[p.id].name}{config.pricing.plans[p.id].monthly !== null ? ` (hoje R$ ${config.pricing.plans[p.id].monthly})` : ""}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Novo valor mensal (R$)
          <Input aria-label="Novo valor mensal" className="w-32" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="grid gap-1">Vigência (opcional)
          <input aria-label="Data de vigência" type="date" min={minEffective()} className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={eff} onChange={(e) => setEff(e.target.value)} />
        </label>
      </div>
      <Input aria-label="Motivo do reajuste" placeholder="Motivo (opcional; fica no registro de auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      <Button disabled={!valid || busy !== null} onClick={() => void announce()}>{busy === "announce" ? "Anunciando…" : "Anunciar reajuste e avisar as casas"}</Button>
      {value !== "" && !valid && <p className="text-xs text-[hsl(var(--danger))]">O novo valor precisa ser maior que o atual e, se informar a data, ela deve ter pelo menos 30 dias à frente.</p>}
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-sm text-muted-foreground">Nenhum reajuste anunciado.</li>}
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm border border-border rounded-xl p-2">
            <span className="flex-1 min-w-[10rem]"><strong>{config.pricing.plans[c.plan as keyof typeof config.pricing.plans]?.name ?? c.plan}</strong>: {formatCents(c.oldCents)} → {formatCents(c.newCents)} a partir de {shortDate(c.effectiveOn)}</span>
            <span className="text-xs text-muted-foreground">{c.notified} casa(s) avisada(s)</span>
            <Badge tone={c.status === "anunciado" ? "gold" : c.status === "aplicado" ? "forest" : "muted"}>{STATUS[c.status]}</Badge>
            {c.status === "anunciado" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void cancel(c.id)}>Cancelar</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
