import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { DAYS, fetchMyAssistant, saveMyAssistant, type AssistantConfig } from "@/lib/assistant";

const PLAN_LABEL = { base: "Base", intermediario: "Intermediário", maximo: "Máximo" } as const;

/** Configuração da assistente pela casa. Só aparece com conta real de casa. */
export default function AssistantSettings() {
  const { currentUser, isRemoteAuth } = useApp();
  const [cfg, setCfg] = useState<AssistantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const show = isRemoteAuth && currentUser?.type === "commercial";
  const userId = currentUser?.id;

  useEffect(() => {
    if (!show || !userId) return;
    let alive = true;
    fetchMyAssistant(userId).then((c) => {
      if (!alive) return;
      setCfg(c);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [show, userId]);

  if (!show) return null;
  if (loading) return <Card className="p-5 text-sm text-muted-foreground">Carregando assistente…</Card>;
  if (!cfg) return null;

  const patch = (p: Partial<AssistantConfig>) => setCfg({ ...cfg, ...p });
  const available = cfg.plan !== "base";
  const fullPlan = cfg.plan === "maximo";

  const save = async () => {
    setSaving(true);
    const ok = await saveMyAssistant(cfg);
    setSaving(false);
    if (ok) toast.success("Assistente salva.");
    else toast.error("Não foi possível salvar. Tente novamente.");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h2 className="font-display font-bold text-lg flex-1">Assistente virtual</h2>
        <Badge tone={available ? "primary" : "muted"}>Plano {PLAN_LABEL[cfg.plan]}</Badge>
      </div>

      {!available && (
        <p className="text-sm text-muted-foreground">
          O plano Base não inclui a assistente. Você já pode deixar tudo configurado; ela passa a responder quando o plano for atualizado.
        </p>
      )}
      {cfg.plan === "intermediario" && (
        <p className="text-sm text-muted-foreground">
          No plano Intermediário a assistente informa e orienta (até 300 respostas por mês). Venda pelo chat e descontos são do plano Máximo.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        Assistente ativada para clientes
      </label>

      <div>
        <Label htmlFor="as-name">Nome da assistente</Label>
        <Input id="as-name" maxLength={40} value={cfg.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
      </div>

      <div>
        <Label htmlFor="as-ins">Como ela deve atender</Label>
        <Textarea
          id="as-ins"
          maxLength={2000}
          value={cfg.instructions}
          onChange={(e) => patch({ instructions: e.target.value })}
          placeholder="Tom acolhedor, como funciona a consulta, o que levar, regras da casa…"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Preços e datas vêm dos seus serviços e rituais cadastrados; a assistente não inventa valores.
        </p>
      </div>

      <div>
        <Label>Horário de atendimento</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DAYS.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-20 text-sm text-muted-foreground">{d.label}</span>
              <Input
                aria-label={`Horário de ${d.label}`}
                maxLength={40}
                placeholder="ex.: 9h às 18h"
                value={cfg.businessHours[d.key] ?? ""}
                onChange={(e) => patch({ businessHours: { ...cfg.businessHours, [d.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className={`flex items-center gap-2 text-sm ${fullPlan ? "" : "opacity-50"}`}>
          <input type="checkbox" disabled={!fullPlan} checked={cfg.canSell} onChange={(e) => patch({ canSell: e.target.checked })} />
          Pode ajudar a fechar vendas (pagamento é gerado pelo sistema)
        </label>
        <label className={`flex items-center gap-2 text-sm ${fullPlan ? "" : "opacity-50"}`}>
          <input type="checkbox" disabled={!fullPlan} checked={cfg.canDiscount} onChange={(e) => patch({ canDiscount: e.target.checked })} />
          Pode oferecer desconto, até
          <Input
            aria-label="Desconto máximo em porcentagem"
            type="number"
            min={0}
            max={100}
            disabled={!fullPlan || !cfg.canDiscount}
            className="w-20 h-9"
            value={cfg.maxDiscountPercent}
            onChange={(e) => patch({ maxDiscountPercent: Number(e.target.value) })}
          />
          %
        </label>
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar assistente"}</Button>
    </Card>
  );
}
