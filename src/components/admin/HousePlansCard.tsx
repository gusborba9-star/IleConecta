import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { PLAN_IDS } from "@/lib/platformConfig";
import { supabase } from "@/lib/supabase";

type PlanId = (typeof PLAN_IDS)[number];
interface Row { house_id: string; name: string; plan: PlanId; revert_to: PlanId | null; revert_at: string | null }
interface Edit { plan: PlanId; trial: boolean; days: string; back: PlanId }

/** O administrador define o plano de cada casa, com degustação opcional (volta sozinha ao plano de antes). */
export default function HousePlansCard() {
  const { config } = usePlatformConfig();
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const planName = (id: PlanId) => config.pricing.plans[id]?.name ?? id;

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_houses_plans");
    const list = ((data as Row[] | null) ?? []).map((r) => ({ ...r }));
    setRows(list);
    setEdits(Object.fromEntries(list.map((r) => [r.house_id, { plan: r.plan, trial: false, days: "7", back: r.plan }])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (r: Row) => {
    const e = edits[r.house_id];
    if (!supabase || !e) return;
    const days = Number(e.days);
    if (e.trial && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
      toast.error("Informe de 1 a 365 dias para a degustação.");
      return;
    }
    setSaving(r.house_id);
    const { error } = await supabase.rpc("admin_set_house_plan", {
      p_house: r.house_id,
      p_plan: e.plan,
      p_revert_to: e.trial ? e.back : null,
      p_revert_at: e.trial ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    });
    setSaving(null);
    if (error) toast.error("Não foi possível alterar o plano.");
    else {
      toast.success(`Plano de ${r.name} atualizado.`);
      await load();
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Plano de cada casa</h2>
      <p className="text-sm text-muted-foreground">
        Defina o plano de uma casa. Na degustação, a casa usa o plano escolhido por alguns dias e volta sozinha ao plano que você indicar (conferido de hora em hora).
      </p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma casa cadastrada.</p>}
      {rows.map((r) => {
        const e = edits[r.house_id];
        if (!e) return null;
        const changed = e.plan !== r.plan || e.trial;
        return (
          <div key={r.house_id} className="border border-border rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold flex-1 min-w-[8rem]">{r.name}</span>
              <select
                aria-label={`Plano de ${r.name}`}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={e.plan}
                onChange={(ev) => setEdits({ ...edits, [r.house_id]: { ...e, plan: ev.target.value as PlanId } })}
              >
                {PLAN_IDS.map((id) => <option key={id} value={id}>{planName(id)}</option>)}
              </select>
            </div>
            {r.revert_at && r.revert_to && (
              <p className="text-xs text-muted-foreground">
                Degustação: volta ao plano {planName(r.revert_to)} em {new Date(r.revert_at).toLocaleString("pt-BR")}.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={e.trial} onChange={(ev) => setEdits({ ...edits, [r.house_id]: { ...e, trial: ev.target.checked } })} />
              Degustação (voltar ao plano anterior depois)
            </label>
            {e.trial && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Por</span>
                <Input aria-label={`Dias de degustação de ${r.name}`} className="w-20" inputMode="numeric" value={e.days}
                  onChange={(ev) => setEdits({ ...edits, [r.house_id]: { ...e, days: ev.target.value } })} />
                <span>dias, depois voltar para</span>
                <select
                  aria-label={`Plano ao fim da degustação de ${r.name}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={e.back}
                  onChange={(ev) => setEdits({ ...edits, [r.house_id]: { ...e, back: ev.target.value as PlanId } })}
                >
                  {PLAN_IDS.map((id) => <option key={id} value={id}>{planName(id)}</option>)}
                </select>
              </div>
            )}
            <Button onClick={() => void save(r)} disabled={saving !== null || !changed}>{saving === r.house_id ? "Salvando…" : "Salvar plano"}</Button>
          </div>
        );
      })}
    </Card>
  );
}
