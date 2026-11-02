import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Button, Input, Label, Modal } from "@/components/base";
import ConsentBox from "@/components/legal/ConsentBox";
import { fetchAcceptedDocs, paymentsEnabledFor, recordConsents } from "@/lib/consents";
import { useApp } from "@/contexts/AppContext";
import { Link } from "react-router-dom";
import { CHECKOUT_DOCS } from "@/lib/legalCore";
import { reserveSeat, type RealRitual } from "@/lib/rituals";
import { goToCheckout } from "@/lib/payments";
import { validateAnswers } from "@/lib/ritualsCore";
import { formatCents } from "@/lib/servicesCore";
import PlatformBenefits from "@/components/PlatformBenefits";

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
  const { currentUser } = useApp();
  const [termsDone, setTermsDone] = useState(false);

  useEffect(() => {
    setAnswers({});
    setErrors({});
    setSaving(false);
    setOkCheckout(false);
    setOkSensitive(false);
    if (!ritual) return;
    let alive = true;
    void paymentsEnabledFor(ownerId).then((v) => alive && setPayOn(v));
    if (currentUser?.id) void fetchAcceptedDocs(currentUser.id).then((d) => alive && setTermsDone(d.has("termos_cliente")));
    return () => {
      alive = false;
    };
  }, [ritual, ownerId, currentUser?.id]);

  if (!ritual) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const v = validateAnswers(ritual.fields, answers);
    if (!v.ok) return setErrors(v.errors);
    if (!okSensitive || (payOn && !termsDone && !okCheckout)) return void toast.error("Marque os aceites para continuar.");
    setSaving(true);
    const consentError = await recordConsents(payOn ? CHECKOUT_DOCS.ritual.filter((d) => !(termsDone && d === "termos_cliente")) : ["dados_sensiveis"], ritual.id);
    if (consentError) {
      setSaving(false);
      return void toast.error(consentError);
    }
    const { error, id } = await reserveSeat(ritual.id, v.value);
    if (error) {
      setSaving(false);
      return void toast.error(error);
    }
    if (payOn && ritual.priceCents > 0 && id) {
      // A vaga fica segurada por 15 min enquanto o cliente paga na página do Stripe.
      toast.success("Vaga segurada. Abrindo o pagamento…");
      const payError = await goToCheckout({ reservationId: id });
      if (payError) {
        setSaving(false);
        toast.error(`${payError} Sua vaga fica segurada por 15 minutos.`);
        onDone();
        onClose();
      }
      return;
    }
    setSaving(false);
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
          {payOn ? "O pagamento é feito pela plataforma, logo após a reserva. Você cancela com reembolso integral até o início do ritual." : "Por enquanto a reserva não gera cobrança; o pagamento é combinado direto com a casa."}
        </p>
        {payOn && <PlatformBenefits />}
        {payOn && !termsDone && <ConsentBox doc="termos_cliente" checked={okCheckout} onChange={setOkCheckout} />}
        {payOn && termsDone && (
          <p className="text-xs text-muted-foreground">
            Você já aceitou os Termos do cliente.{" "}
            <Link to="/sobre/termos-do-cliente" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver os termos</Link>
          </p>
        )}
        <ConsentBox doc="dados_sensiveis" checked={okSensitive} onChange={setOkSensitive} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Reservando…" : "Confirmar reserva"}</Button>
        </div>
      </form>
    </Modal>
  );
}
