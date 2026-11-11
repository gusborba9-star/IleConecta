import { useState } from "react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import ConsentBox from "@/components/legal/ConsentBox";
import { recordConsents } from "@/lib/consents";
import type { ConsentDocKey } from "@/lib/legalCore";
import { useApp } from "@/contexts/AppContext";

interface Props {
  /** Documentos obrigatórios (os Termos) e opcionais (dados sensíveis, só para cliente), vindos de gateDocs(). */
  required: ConsentDocKey[];
  optional: ConsentDocKey[];
  /** Há um aceite antigo: o texto mudou de versão. */
  renewal: boolean;
  /** Chamado só depois de o servidor confirmar que o aceite foi gravado. */
  onDone: () => void;
}

/** Tela única de aceite: aparece uma só vez por conta (de novo apenas se o texto mudar de versão). */
export default function TermsGate({ required, optional, renewal, onDone }: Props) {
  const { logout } = useApp();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const allRequired = required.every((d) => checked[d]);

  const accept = async () => {
    if (!allRequired || saving) return;
    setSaving(true);
    const docs = [...required, ...optional.filter((d) => checked[d])];
    const error = await recordConsents(docs);
    setSaving(false);
    if (error) return void toast.error(error);
    onDone();
  };

  return (
    <div className="mx-auto max-w-xl py-6" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <Card className="p-6 space-y-4">
        <div>
          <h1 id="terms-gate-title" className="font-display font-bold text-2xl">{renewal ? "Atualizamos os nossos termos" : "Termos de Uso"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {renewal
              ? "Leia a nova versão e aceite para continuar."
              : "Leia e aceite para continuar. Você faz isso uma única vez, e pode rever tudo depois em “Termos e normas”, no menu."}
          </p>
        </div>
        {required.map((d) => (
          <ConsentBox key={d} doc={d} checked={Boolean(checked[d])} onChange={(v) => setChecked((c) => ({ ...c, [d]: v }))} />
        ))}
        {optional.map((d) => (
          <div key={d} className="space-y-1">
            <ConsentBox doc={d} checked={Boolean(checked[d])} onChange={(v) => setChecked((c) => ({ ...c, [d]: v }))} />
            <p className="text-xs text-muted-foreground px-1">
              Opcional. Se você não marcar, pode usar a plataforma normalmente e a autorização será pedida só quando for contratar. Você pode retirá-la quando quiser em “Termos e normas”.
            </p>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => void logout()}>Sair</Button>
          <Button type="button" disabled={!allRequired || saving} onClick={() => void accept()}>{saving ? "Salvando…" : "Aceitar e continuar"}</Button>
        </div>
      </Card>
    </div>
  );
}
