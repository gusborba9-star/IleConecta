import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input, Label, Textarea } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { supabase } from "@/lib/supabase";
import { FEE_KINDS, changedKinds, formatPercent, parsePercent } from "@/lib/feeRulesCore";

type Rates = Record<string, number>;
interface Version { version: string; rates: Rates; reason: string; created_at: string }

/** Taxas da plataforma (comissão sobre cada venda). Cada mudança cria uma versão nova; pagamentos já feitos não são recalculados. */
export default function FeeRulesCard() {
  const confirm = useConfirm();
  const [versions, setVersions] = useState<Version[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("fee_rule_versions").select("version, rates, reason, created_at").order("seq", { ascending: false }).limit(20);
    const list = (data ?? []) as Version[];
    setVersions(list);
    if (list[0]) setFields(Object.fromEntries(FEE_KINDS.map((k) => [k.key, formatPercent(list[0].rates[k.key])])));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = versions[0];
  const next: Rates = {};
  let valid = Boolean(current);
  for (const k of FEE_KINDS) {
    const bps = parsePercent(fields[k.key] ?? "");
    if (bps === null) valid = false; else next[k.key] = bps;
  }
  const changed = valid && current ? changedKinds(current.rates, next) : [];
  const reasonOk = reason.trim().length >= 10;

  const save = async () => {
    if (!supabase || !current || !valid || changed.length === 0 || !reasonOk) return;
    const resumo = changed.map((key) => `${FEE_KINDS.find((k) => k.key === key)?.label}: ${formatPercent(current.rates[key])}% → ${formatPercent(next[key])}%`).join("\n");
    const yes = await confirm({ title: "Salvar as novas taxas?", message: `${resumo}\n\nValem só para pagamentos novos. Os já feitos não mudam.`, confirmLabel: "Salvar taxas" });
    if (!yes) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_fee_rules", { p_rates: next, p_reason: reason.trim() });
    setSaving(false);
    if (error) { toast.error(error.message || "Não foi possível salvar."); return; }
    toast.success("Taxas salvas. Valem para os próximos pagamentos.");
    setReason("");
    await load();
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg">Taxas da plataforma</h2>
        <p className="text-sm text-muted-foreground">
          Comissão da plataforma sobre cada venda. Cada mudança cria uma versão nova com o motivo registrado. Vale só para pagamentos novos:
          o que já foi pago não é recalculado.
        </p>
      </div>
      {current ? (
        <>
          <p className="text-sm">Regra em vigor: <strong>{current.version}</strong></p>
          <div className="grid gap-3 sm:grid-cols-3">
            {FEE_KINDS.map((k) => {
              const bad = parsePercent(fields[k.key] ?? "") === null;
              return (
                <div key={k.key} className="space-y-1">
                  <Label htmlFor={`fee-${k.key}`}>{k.label} (%)</Label>
                  <Input id={`fee-${k.key}`} inputMode="decimal" value={fields[k.key] ?? ""} onChange={(e) => setFields((f) => ({ ...f, [k.key]: e.target.value }))} aria-invalid={bad} />
                  {bad && <p className="text-xs text-destructive">De 0 a 30, com até 2 casas.</p>}
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fee-reason">Motivo da mudança</Label>
            <Textarea id="fee-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: nova política aprovada em reunião (mínimo de 10 caracteres)" />
          </div>
          <Button onClick={save} disabled={saving || !valid || changed.length === 0 || !reasonOk}>{saving ? "Salvando…" : "Salvar taxas"}</Button>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Histórico de versões ({versions.length})</summary>
            <ul className="mt-2 space-y-2">
              {versions.map((v) => (
                <li key={v.version} className="rounded-md border p-2">
                  <p className="font-medium">{v.version} <span className="font-normal text-muted-foreground">· {new Date(v.created_at).toLocaleDateString("pt-BR")}</span></p>
                  <p className="text-muted-foreground">{FEE_KINDS.map((k) => `${k.label}: ${formatPercent(v.rates[k.key])}%`).join(" · ")}</p>
                  <p>{v.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Carregando a regra em vigor…</p>
      )}
    </Card>
  );
}
