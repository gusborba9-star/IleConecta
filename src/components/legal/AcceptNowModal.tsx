import { useState } from "react";
import { toast } from "sonner";
import { Button, Modal } from "@/components/base";
import ConsentBox from "@/components/legal/ConsentBox";
import { recordConsents } from "@/lib/consents";
import type { ConsentDocKey } from "@/lib/legalCore";

interface Props {
  docs: ConsentDocKey[];
  /** Mensagem de contexto (ex.: "Para publicar uma nova oferta, aceite a versão vigente."). */
  reason?: string;
  onClose: () => void;
  /** Chamado só depois de o servidor confirmar o registro (versão, data e IP). */
  onAccepted: () => void;
}

/** Aceite da versão vigente num momento de compra, venda ou assinatura. Nada é marcado de antemão. */
export default function AcceptNowModal({ docs, reason, onClose, onAccepted }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const all = docs.every((d) => checked[d]);
  const accept = async () => {
    if (!all || saving) return;
    setSaving(true);
    const error = await recordConsents(docs);
    setSaving(false);
    if (error) return void toast.error(error);
    onAccepted();
  };
  return (
    <Modal open onClose={onClose} title="Termos atualizados" maxWidth="max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{reason ?? "Leia a versão vigente e aceite para continuar."}</p>
        {docs.map((d) => (
          <ConsentBox key={d} doc={d} checked={Boolean(checked[d])} onChange={(v) => setChecked((c) => ({ ...c, [d]: v }))} />
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Agora não</Button>
          <Button type="button" disabled={!all || saving} onClick={() => void accept()}>{saving ? "Salvando…" : "Aceitar e continuar"}</Button>
        </div>
      </div>
    </Modal>
  );
}
