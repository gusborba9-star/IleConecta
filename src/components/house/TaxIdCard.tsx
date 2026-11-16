import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Label } from "@/components/base";
import { fetchTaxIdStatus, saveTaxId } from "@/lib/taxId";
import { formatTaxIdInput, taxIdKind, type TaxIdStatus } from "@/lib/taxIdCore";

/** CPF ou CNPJ da casa: pedido ao contratar plano pago (a casa no Grátis não precisa informar). Guardado protegido; aqui só aparece o final. */
export default function TaxIdCard() {
  const [st, setSt] = useState<TaxIdStatus | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setSt(await fetchTaxIdStatus()), []);
  useEffect(() => { void load(); }, [load]);
  if (!st || !st.hasHouse) return null;

  if (st.set) {
    return (
      <Card className="p-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{st.kind === "cnpj" ? "CNPJ" : "CPF"} da casa</span>
        <Badge tone="forest">Informado</Badge>
        <span className="text-muted-foreground">{st.masked}</span>
        <span className="text-xs text-muted-foreground">Para corrigir, fale com o Suporte.</span>
      </Card>
    );
  }
  const kind = taxIdKind(value);
  const submit = async () => {
    if (!kind) return void toast.error("CPF ou CNPJ inválido. Confira os números.");
    setBusy(true);
    const err = await saveTaxId(value);
    setBusy(false);
    if (err) return void toast.error(err);
    toast.success("Documento guardado.");
    setValue("");
    await load();
  };
  return (
    <Card className="p-5 space-y-3 border-gold/40">
      <div>
        <h2 className="font-display font-bold text-lg">{st.subscribed ? "Informe o CPF ou CNPJ da casa" : "CPF ou CNPJ da casa"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {st.subscribed
            ? "É pedido para a cobrança e para as obrigações fiscais. Sua casa segue funcionando normalmente; o documento passa a ser exigido na próxima contratação (troca de plano, vaga extra)."
            : "É necessário só para contratar um plano pago. Quem fica no plano Grátis não precisa informar."}
        </p>
      </div>
      <div className="max-w-sm">
        <Label htmlFor="taxid">CPF ou CNPJ</Label>
        <Input id="taxid" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => setValue(formatTaxIdInput(e.target.value))} placeholder="000.000.000-00 ou 00.000.000/0000-00" aria-invalid={value.length >= 14 && !kind} />
        {value.length >= 14 && !kind && <p className="text-xs text-[hsl(var(--danger))] mt-1">Números inválidos. Confira.</p>}
      </div>
      <p className="text-xs text-muted-foreground">Guardamos criptografado, sem aparecer em nenhuma página pública. A administração só consulta com motivo registrado. Depois de informado, só o Suporte corrige.</p>
      <Button variant="gold" disabled={busy || !kind} onClick={() => void submit()}>{busy ? "Guardando…" : "Guardar documento"}</Button>
    </Card>
  );
}
