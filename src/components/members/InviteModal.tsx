import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2 } from "lucide-react";
import { Button, Modal } from "@/components/base";
import { createInvite, inviteUrl, revokeGeneralInvite } from "@/lib/members";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sem id = link geral da casa; com id = link só desse membro (vale 30 dias). */
  memberId?: string;
  memberName?: string;
}

export default function InviteModal({ open, onClose, memberId, memberName }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setUrl(null);
    setQr(null);
    setError(null);
    void createInvite(memberId).then(async (r) => {
      if (!alive) return;
      if (!r.token) return setError(r.error ?? "Não foi possível gerar o link.");
      const link = inviteUrl(r.token);
      setUrl(link);
      try {
        const QR = await import("qrcode");
        const data = await QR.toDataURL(link, { width: 220, margin: 1 });
        if (alive) setQr(data);
      } catch {
        /* sem QR, o link continua valendo */
      }
    });
    return () => {
      alive = false;
    };
  }, [open, memberId]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie.");
    }
  };
  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: "Convite para a nossa casa", text: "Entre na lista de membros da nossa casa no Ilê Conecta:", url });
    } catch {
      /* a pessoa cancelou */
    }
  };
  const revoke = async () => {
    const err = await revokeGeneralInvite();
    if (err) return void toast.error(err);
    toast.success("Link desativado. Ao gerar de novo, será um link diferente.");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={memberId ? `Convite para ${memberName ?? "o membro"}` : "Convite para a casa"} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {memberId
            ? "Este link é só dele(a): ao aceitar, a conta vira o cadastro que você já fez. Vale por 30 dias."
            : "Quem abrir o link e aceitar entra na sua lista de membros, com o valor e o dia padrão. Você pode ajustar depois e desativar o link quando quiser."}
        </p>
        {error && <p className="text-sm text-[hsl(var(--danger))]">{error}</p>}
        {!error && !url && <p className="text-sm text-muted-foreground">Gerando link…</p>}
        {url && (
          <>
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" className="w-full h-11 rounded-xl border border-input bg-muted px-3 text-xs" />
            {qr && <img src={qr} alt="QR code do convite" width={220} height={220} className="mx-auto rounded-xl border border-border" />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void copy()}><Copy className="h-4 w-4" /> Copiar link</Button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button type="button" variant="outline" onClick={() => void share()}><Share2 className="h-4 w-4" /> Compartilhar</Button>
              )}
              {!memberId && <Button type="button" variant="ghost" onClick={() => void revoke()}>Desativar link</Button>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
