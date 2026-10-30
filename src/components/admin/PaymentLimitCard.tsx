import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import MoneyInput from "@/components/base/MoneyInput";
import { centsToMasked, maskedToCents } from "@/lib/moneyMask";
import { fetchPaymentMaxCents } from "@/lib/paymentLimit";
import { saveSetting } from "@/lib/platformConfig";
import { MAX_STAGES } from "@/lib/paymentsCore";

const MIN_REAIS = 100;
const MAX_REAIS = 100000;

/** Teto por pagamento (o Pix do Stripe tem limite por transação). Serviços acima do teto só vendem em etapas. */
export default function PaymentLimitCard() {
  const [reais, setReais] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchPaymentMaxCents().then((c) => setReais(centsToMasked(c)));
  }, []);

  const cents = maskedToCents(reais);
  const valid = cents !== null && cents >= MIN_REAIS * 100 && cents <= MAX_REAIS * 100;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const ok = await saveSetting("payment_limits", { max_cents: cents });
    setSaving(false);
    if (ok) toast.success("Teto por pagamento salvo.");
    else toast.error("Não foi possível salvar.");
  };

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Teto por pagamento</h2>
      <p className="text-sm text-muted-foreground">
        Valor máximo de cada pagamento pela plataforma (hoje o Pix do Stripe é limitado por transação). Um serviço mais caro só é vendido
        se a casa o dividir em etapas (até {MAX_STAGES}), cada uma dentro deste teto. Suba o valor só depois de o Stripe liberar um limite maior.
      </p>
      <div className="flex items-center gap-2 max-w-xs">
        <span className="text-sm">R$</span>
        <MoneyInput aria-label="Teto por pagamento em reais" value={reais} onValueChange={setReais} />
      </div>
      {!valid && reais !== "" && (
        <p className="text-sm text-destructive">Informe um valor entre R$ {MIN_REAIS} e R$ {MAX_REAIS.toLocaleString("pt-BR")}.</p>
      )}
      <Button onClick={save} disabled={saving || !valid}>{saving ? "Salvando…" : "Salvar teto"}</Button>
    </Card>
  );
}
