import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/base";
import { useConfirm } from "@/components/base/Confirm";
import { fetchOperator, fetchOperatorLog, saveOperator, type OperatorLogRow } from "@/lib/operator";
import { operatorProblem, operatorSentence } from "@/lib/operatorCore.js";

type Form = { name: string; document: string; address: string; email: string };
const EMPTY: Form = { name: "", document: "", address: "", email: "" };
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Quem opera a plataforma, como aparece no começo dos Termos e da Política (só o dono). Ao abrir o CNPJ, troque aqui. */
export default function OperatorCard() {
  const confirm = useConfirm();
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<OperatorLogRow[]>([]);
  const load = async () => {
    const [op, l] = await Promise.all([fetchOperator(), fetchOperatorLog()]);
    const f = { name: op?.name ?? "", document: op?.document ?? "", address: op?.address ?? "", email: op?.email ?? "" };
    setSaved(f); setForm(f); setLog(l);
  };
  useEffect(() => { void load(); }, []);
  if (!saved) return null;
  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k].trim() !== saved[k].trim());
  const problem = dirty ? operatorProblem(form) : null;
  const preview = operatorSentence({ name: form.name, document: form.document, address: form.address || null, email: form.email || null });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const apply = async () => {
    if (busy || !dirty) return;
    if (problem) { toast.error(problem); return; }
    const ok = await confirm({
      title: "Trocar a identificação do operador?",
      message: notify
        ? "A nova identificação aparece agora nos Termos e na Política, e todas as contas recebem um aviso com o link. Ninguém fica travado."
        : "A nova identificação aparece agora nos Termos e na Política. Ninguém será avisado.",
    });
    if (!ok) return;
    setBusy(true);
    const r = await saveOperator(form, notify);
    setBusy(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success(notify ? `Salvo. ${r.notified ?? 0} conta(s) avisada(s).` : "Salvo. Ninguém foi avisado.");
    void load();
  };
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" aria-hidden /> Identificação do operador</h2>
      <p className="text-sm text-muted-foreground">Quem opera a plataforma, no começo dos Termos e da Política (exigência do Decreto do E-commerce). Aparece só ali, não no rodapé. Quando abrir o CNPJ, troque os dados aqui.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0"><Label htmlFor="op-name">Nome completo ou razão social</Label><Input id="op-name" value={form.name} maxLength={120} onChange={set("name")} autoComplete="off" /></div>
        <div className="min-w-0"><Label htmlFor="op-doc">CPF mascarado ou CNPJ completo</Label><Input id="op-doc" value={form.document} maxLength={18} onChange={set("document")} placeholder="***.123.456-** ou 00.000.000/0000-00" autoComplete="off" aria-describedby="op-doc-help" />
          <p id="op-doc-help" className="text-xs text-muted-foreground mt-1">O CPF completo não é aceito: troque os 3 primeiros e os 2 últimos números por asteriscos.</p></div>
        <div className="min-w-0"><Label htmlFor="op-addr">Endereço ou caixa postal (opcional)</Label><Input id="op-addr" value={form.address} maxLength={200} onChange={set("address")} autoComplete="off" /></div>
        <div className="min-w-0"><Label htmlFor="op-mail">E-mail de atendimento (opcional)</Label><Input id="op-mail" type="email" value={form.email} maxLength={120} onChange={set("email")} autoComplete="off" placeholder="contato@ileconecta.com.br" /></div>
      </div>
      {preview && <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm break-words" aria-label="Como vai aparecer">{preview}</p>}
      {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <span>Avisar todas as contas desta mudança (recomendado).</span>
      </label>
      <Button onClick={() => void apply()} disabled={!dirty || busy || !!problem}>{busy ? "Salvando…" : "Salvar identificação"}</Button>
      {log.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Histórico de mudanças ({log.length})</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {log.map((l, i) => <li key={i} className="break-words">{fmt(l.at)} · {l.by ?? "conta removida"}: {l.name}, {l.document}{l.address ? `, ${l.address}` : ""}{l.email ? `, ${l.email}` : ""}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}
