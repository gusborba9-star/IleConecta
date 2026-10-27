import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Button, Input, Label, Modal } from "@/components/base";
import ConsentBox from "@/components/legal/ConsentBox";
import { paymentsEnabledFor, recordConsents } from "@/lib/consents";
import { CHECKOUT_DOCS } from "@/lib/legalCore";
import { reserveSeat, type RealRitual } from "@/lib/rituals";
import { validateAnswers } from "@/lib/ritualsCore";
import { formatCents } from "@/lib/servicesCore";

interface Props {
  ritual: RealRitual | null;
  onClose: () => void;
  onDone: () => void;
}

export default function ReserveModal({ ritual, onClose, onDone }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { id: ownerId } = useParams();
  const [payOn, setPayOn] = useState(false);
  const [okCheckout, setOkCheckout] = useState(false);
  const [okSensitive, setOkSensitive] = useState(false);

  useEffect(() => {
    setAnswers({});
    setErrors({});
    setSaving(false);
    setOkCheckout(false);
    setOkSensitive(false);
    if (!ritual) return;
    let alive = true;
    void paymentsEnabledFor(ownerId).then((v) => alive && setPayOn(v));
    return () => {
      alive = false;
    };
  }, [ritual, ownerId]);

  if (!ritual) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const v = validateAnswers(ritual.fields, answers);
    if (!v.ok) return setErrors(v.errors);
    if (!okSensitive || (payOn && !okCheckout)) return void toast.error("Marque os aceites para continuar.");
    setSaving(true);
    const consentError = await recordConsents(payOn ? CHECKOUT_DOCS.ritual : ["dados_sensiveis"], ritual.id);
    if (consentError) {
      setSaving(false);
      return void toast.error(consentError);
    }
    const error = await reserveSeat(ritual.id, v.value);
    setSaving(false);
    if (error) return void toast.error(error);
    toast.success("Vaga reservada!");
    onDone();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Reservar vaga — ${ritual.title}`} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {ritual.fields.length > 0 && (
          <p className="text-sm text-muted-foreground">A casa pediu estas informações para realizar o ritual. Elas ficam visíveis apenas para a casa.</p>
        )}
        {ritual.fields.map((f) => (
          <div key={f.id}>
            <Label htmlFor={`ans-${f.id}`}>{f.label}{f.required ? "" : " (opcional)"}</Label>
            <Input id={`ans-${f.id}`} maxLength={500} value={answers[f.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))} />
            {errors[f.id] && <p className="text-sm text-[hsl(var(--danger))] mt-1">{errors[f.id]}</p>}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Valor da vaga: {formatCents(ritual.priceCents)}.{" "}
          {payOn ? "O pagamento é feito pela plataforma, logo após a reserva." : "Por enquanto a reserva não gera cobrança; o pagamento é combinado direto com a casa."}
        </p>
        {payOn && <ConsentBox doc="checkout_ritual" checked={okCheckout} onChange={setOkCheckout} />}
        <ConsentBox doc="dados_sensiveis" checked={okSensitive} onChange={setOkSensitive} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Reservando…" : "Confirmar reserva"}</Button>
        </div>
      </form>
    </Modal>
  );
}
