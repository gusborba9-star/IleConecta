import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Siren } from "lucide-react";
import { Button, Card, Textarea } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { fetchMaintenance, saveMaintenance } from "@/lib/maintenance";
import { MAINTENANCE_DEFAULT } from "@/lib/maintenanceCore.js";

/** Interruptor de emergência (só o dono). Ligado, os usuários veem aviso de manutenção e a função recusa novas operações do módulo. */
export default function MaintenanceCard() {
  const confirm = useConfirm();
  const [state, setState] = useState<{ assistant: boolean; payments: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState<{ assistant: boolean; payments: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchMaintenance().then((m) => {
      if (!alive) return;
      const s = { assistant: m.assistant, payments: m.payments, message: m.message ?? "" };
      setState(s); setSaved(s);
    });
    return () => { alive = false; };
  }, []);
  if (!state || !saved) return null;
  const dirty = state.assistant !== saved.assistant || state.payments !== saved.payments || state.message.trim() !== saved.message.trim();
  const turningOn = (state.assistant && !saved.assistant) || (state.payments && !saved.payments);
  const apply = async () => {
    if (busy) return;
    if (turningOn) {
      const what = [state.assistant && !saved.assistant ? "a assistente (IA)" : null, state.payments && !saved.payments ? "os pagamentos" : null].filter(Boolean).join(" e ");
      const ok = await confirm({ title: "Ligar manutenção?", message: `Isto desliga ${what} para todos os usuários agora. Eles verão o aviso de manutenção. Webhooks do Stripe, reembolsos e conferências continuam funcionando.`, confirmLabel: "Ligar manutenção", danger: true });
      if (!ok) return;
    }
    setBusy(true);
    const err = await saveMaintenance(state.assistant, state.payments, state.message);
    setBusy(false);
    if (err) { toast.error(err); return; }
    setSaved({ ...state, message: state.message.trim() });
    toast.success(state.assistant || state.payments ? "Manutenção ligada. Os usuários já veem o aviso." : "Tudo voltou ao normal.");
  };
  const row = (key: "assistant" | "payments", title: string, desc: string) => (
    <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={state[key]} onChange={(e) => setState({ ...state, [key]: e.target.checked })} />
      <span className="min-w-0 break-words">
        <span className="block font-semibold text-sm">{title} {saved[key] && <span className="ml-1 text-xs font-bold text-destructive">(em manutenção agora)</span>}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg flex items-center gap-2"><Siren className="h-5 w-5 text-primary" /> Interruptor de emergência</h2>
      <p className="text-sm text-muted-foreground">Use quando algo estiver errado e for preciso parar um módulo enquanto o problema é corrigido. Os usuários veem um aviso de manutenção em vez de erro. Nada é apagado.</p>
      {row("assistant", "Assistente (IA)", "Assistente das casas e Conecta. Os usuários recebem o aviso no lugar da resposta.")}
      {row("payments", "Pagamentos", "Impede novos pagamentos, assinaturas, créditos e impulsionamentos e pausa a cobrança automática do cartão salvo. Quem já abriu a página do Stripe ainda consegue pagar, e o pagamento é registrado. Reembolsos, avisos (webhooks) e conferências do Stripe seguem funcionando.")}
      <div>
        <label htmlFor="maint-msg" className="text-sm font-medium">Mensagem para os usuários (opcional)</label>
        <Textarea id="maint-msg" rows={2} maxLength={200} value={state.message} onChange={(e) => setState({ ...state, message: e.target.value })}
          placeholder={`Se ficar em branco: "${MAINTENANCE_DEFAULT.payments}" ou "${MAINTENANCE_DEFAULT.assistant}"`} />
        <div className="text-xs text-muted-foreground mt-1">{state.message.length} de 200</div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void apply()} disabled={!dirty || busy}>{busy ? "Salvando…" : turningOn ? "Ligar manutenção" : "Salvar"}</Button>
        {(saved.assistant || saved.payments) && !dirty && <span className="text-xs text-destructive font-semibold" role="status">Há módulo em manutenção neste momento.</span>}
      </div>
    </Card>
  );
}
