import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { supabase } from "@/lib/supabase";
import { CAP_FLAGS, CAP_NUMBERS, type CapFlagKey, type CapNumberKey, type PlanMatrix } from "@/lib/planMatrixCore";
import { PLAN_IDS, type PlanId } from "@/lib/platformConfigCore";

const FEATURE_LABEL: Record<string, string> = {
  ritual_video: "Vídeo de 30 s", assistant: "Assistente", boost: "Impulsionamento", highlight: "Destaque",
  payments: "Pagamentos", referral: "Indique e ganhe", reviews: "Avaliações", calendar: "Calendário",
};
const MAX_BENEFITS = 12;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Matriz central de planos: limites, ferramentas e textos de cada plano. A mudança vale na hora para todas as casas. */
export default function PlanMatrixCard() {
  const confirm = useConfirm();
  const { config, reload } = usePlatformConfig();
  const saved = config.plan_matrix;
  const [draft, setDraft] = useState<PlanMatrix>(() => clone(saved));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(clone(saved)); }, [saved]);

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const textsOk = PLAN_IDS.every((id) => draft.copy[id].tagline.trim() && draft.copy[id].benefits.every((b) => b.text.trim()));

  const setNum = (plan: PlanId, key: CapNumberKey, raw: string) => {
    const [min, max] = CAP_NUMBERS[key];
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n)) return;
    setDraft((d) => ({ ...d, caps: { ...d.caps, [plan]: { ...d.caps[plan], [key]: Math.max(min, Math.min(max, n)) } } }));
  };
  const setFlag = (plan: PlanId, key: CapFlagKey, v: boolean) => setDraft((d) => ({ ...d, caps: { ...d.caps, [plan]: { ...d.caps[plan], [key]: v } } }));
  const setCopy = (plan: PlanId, fn: (c: PlanMatrix["copy"][PlanId]) => PlanMatrix["copy"][PlanId]) => setDraft((d) => ({ ...d, copy: { ...d.copy, [plan]: fn(d.copy[plan]) } }));

  const save = async () => {
    if (!supabase || !changed || !textsOk) return;
    const yes = await confirm({ title: "Salvar a matriz de planos?", message: "Limites, ferramentas e textos mudam na hora para todas as casas.", confirmLabel: "Salvar" });
    if (!yes) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_setting", { p_key: "plan_matrix", p_value: draft });
    setSaving(false);
    if (error) { toast.error(error.message || "Não foi possível salvar."); return; }
    toast.success("Matriz de planos salva.");
    await reload();
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg">Planos: ferramentas, limites e textos</h2>
        <p className="text-sm text-muted-foreground">
          É daqui que o banco, a assistente e a página de planos leem o que cada plano inclui. Nos textos, escreva {"{assistant_replies}"}, {"{campaign_links}"},{" "}
          {"{campaign_card_styles}"}, {"{quick_replies}"} ou {"{included_seats}"} para o número do plano aparecer sozinho. Um item ligado a uma ferramenta só aparece na
          página de planos quando o interruptor dela está ligado (e entra com a marca "Novo"). Preços ficam em outro cartão.
        </p>
      </div>
      {PLAN_IDS.map((plan) => (
        <details key={plan} className="rounded-xl border p-3" open={plan === "maximo"}>
          <summary className="cursor-pointer font-semibold">{config.pricing.plans[plan].name}</summary>
          <div className="mt-3 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(CAP_NUMBERS) as CapNumberKey[]).map((k) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`${plan}-${k}`}>{CAP_NUMBERS[k][2]}</Label>
                  <Input id={`${plan}-${k}`} type="number" inputMode="numeric" min={CAP_NUMBERS[k][0]} max={CAP_NUMBERS[k][1]} value={draft.caps[plan][k]} onChange={(e) => setNum(plan, k, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(CAP_FLAGS) as CapFlagKey[]).map((k) => (
                <label key={k} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={draft.caps[plan][k]} onChange={(e) => setFlag(plan, k, e.target.checked)} />
                  <span>{CAP_FLAGS[k]}</span>
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${plan}-tag`}>Frase do plano</Label>
              <Input id={`${plan}-tag`} maxLength={120} value={draft.copy[plan].tagline} onChange={(e) => setCopy(plan, (c) => ({ ...c, tagline: e.target.value }))} />
              <p className="text-sm font-medium pt-1">Ferramentas mostradas na página de planos</p>
              {draft.copy[plan].benefits.map((b, i) => (
                <div key={i} className="rounded-lg border p-2 space-y-2">
                  <Input aria-label={`Texto do item ${i + 1}`} maxLength={200} value={b.text} onChange={(e) => setCopy(plan, (c) => ({ ...c, benefits: c.benefits.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Quando o item ${i + 1} aparece`} className="rounded-md border bg-background px-2 py-1 text-sm" value={b.feature ?? ""}
                      onChange={(e) => setCopy(plan, (c) => ({ ...c, benefits: c.benefits.map((x, j) => (j === i ? { ...x, feature: e.target.value || null } : x)) }))}>
                      <option value="">Sempre aparece</option>
                      {Object.entries(FEATURE_LABEL).map(([f, l]) => <option key={f} value={f}>Só com o interruptor: {l}</option>)}
                    </select>
                    <Button size="icon" variant="ghost" aria-label="Subir item" disabled={i === 0} onClick={() => setCopy(plan, (c) => { const a = c.benefits.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...c, benefits: a }; })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Descer item" disabled={i === draft.copy[plan].benefits.length - 1} onClick={() => setCopy(plan, (c) => { const a = c.benefits.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...c, benefits: a }; })}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => setCopy(plan, (c) => ({ ...c, benefits: c.benefits.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" disabled={draft.copy[plan].benefits.length >= MAX_BENEFITS} onClick={() => setCopy(plan, (c) => ({ ...c, benefits: [...c.benefits, { text: "", feature: null }] }))}><Plus className="h-4 w-4" /> Adicionar item</Button>
            </div>
          </div>
        </details>
      ))}
      {!textsOk && <p className="text-sm text-destructive">Preencha a frase e o texto de todos os itens (ou remova os vazios).</p>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !changed || !textsOk}>{saving ? "Salvando…" : "Salvar planos"}</Button>
        <Button variant="ghost" onClick={() => setDraft(clone(saved))} disabled={!changed || saving}>Desfazer</Button>
      </div>
    </Card>
  );
}
