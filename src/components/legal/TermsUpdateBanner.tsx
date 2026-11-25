import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "@/components/base";
import AcceptNowModal from "@/components/legal/AcceptNowModal";
import type { ConsentDocKey } from "@/lib/legalCore";

interface Props {
  /** Documentos aceitos numa versão antiga (vem de renewalDocs). */
  docs: ConsentDocKey[];
  onAccepted: () => void;
  onDismiss: () => void;
}

/** Aviso na Home quando houve mudança importante nos termos. Não tranca nada: quem fecha o aviso segue usando, e o aceite é pedido só na próxima compra, venda ou assinatura. */
export default function TermsUpdateBanner({ docs, onAccepted, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  if (docs.length === 0) return null;
  return (
    <Card className="mb-4 p-4 border-gold/40" role="region" aria-label="Atualização dos termos">
      <p className="text-sm font-semibold">Atualizamos nossos Termos de Uso e Política de Privacidade.</p>
      <p className="text-sm text-muted-foreground mt-1">
        Confira o que mudou. Para realizar novas contratações, vendas ou assinaturas, será necessário aceitar a versão vigente.{" "}
        <Link to="/termos" className="text-primary hover:underline">Ver termos e normas</Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>Ler e aceitar agora</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>Fechar / Ver depois</Button>
      </div>
      {open && <AcceptNowModal docs={docs} onClose={() => setOpen(false)} onAccepted={() => { setOpen(false); onAccepted(); }} />}
    </Card>
  );
}
