import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { supabase } from "@/lib/supabase";
import { PROMO_SCOPES, SCOPE_NAME, type PromoScopeKey } from "@/lib/promotionsCore";

/** Vagas do destaque por alcance (casas em destaque ao mesmo tempo). Mudança exige motivo e fica na auditoria. */
export default function PromoLimitsCard() {
  const [slots, setSlots] = useState<Record<PromoScopeKey, number> | null>(null);
  const [draft, setDraft] = useState<Record<PromoScopeKey, string>>({ cidade: "", estado: "", pais: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("promo_limits").select("scope, highlight_slots");
    if (!data) return;
    const m = { cidade: 0, estado: 0, pais: 0 } as Record<PromoScopeKey, number>;
    for (const r of data) if (PROMO_SCOPES.includes(r.scope as PromoScopeKey)) m[r.scope as PromoScopeKey] = Number(r.highlight_slots);
    setSlots(m);
    setDraft({ cidade: String(m.cidade), estado: String(m.estado), pais: String(m.pais) });
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!supabase || !slots) return;
    const changed = PROMO_SCOPES.filter((k) => Number(draft[k]) !== slots[k]);
    if (changed.length === 0) return void toast.info("Nada mudou.");
    if (reason.trim().length < 3) return void toast.error("Informe o motivo da mudança.");
    setBusy(true);
    for (const k of changed) {
      const { error } = await supabase.rpc("admin_set_promo_limit", { p_scope: k, p_slots: Number(draft[k]), p_reason: reason.trim() });
      if (error) { setBusy(false); return void toast.error("Informe de 1 a 1000 vagas por alcance."); }
    }
    setBusy(false);
    setReason("");
    toast.success("Vagas atualizadas.");
    await load();
  };
  if (!slots) return null;
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Vagas do destaque</h2>
      <p className="text-xs text-muted-foreground">Quantas casas podem estar em destaque ao mesmo tempo em cada cidade, estado e país. Quem já está em destaque pode somar dias sem ocupar outra vaga.</p>
      <div className="grid grid-cols-3 gap-3">
        {PROMO_SCOPES.map((k) => (
          <div key={k}>
            <div className="text-xs text-muted-foreground mb-1">{SCOPE_NAME[k]}</div>
            <Input aria-label={`Vagas ${SCOPE_NAME[k]}`} type="number" min={1} max={1000} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <Input aria-label="Motivo da mudança" placeholder="Motivo (fica registrado na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      <Button onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar vagas"}</Button>
    </Card>
  );
}
