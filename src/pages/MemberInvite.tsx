import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { acceptInvite, fetchInvitePreview, type InvitePreview } from "@/lib/members";

export default function MemberInvite() {
  const { token = "" } = useParams();
  const { isRemoteAuth } = useApp();
  const nav = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (isRemoteAuth) void fetchInvitePreview(token).then((p) => alive && setPreview(p));
    else setPreview(null);
    return () => {
      alive = false;
    };
  }, [token, isRemoteAuth]);

  const accept = async () => {
    setBusy(true);
    const err = await acceptInvite(token);
    setBusy(false);
    if (err) return void toast.error(err);
    toast.success("Pronto! Você entrou na lista da casa.");
    nav("/mensalidades", { replace: true });
  };

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-16 lg:pb-4">
      <Card className="p-6 space-y-4">
        {preview === undefined && <p className="text-sm text-muted-foreground">Verificando o convite…</p>}
        {preview === null && (
          <>
            <h1 className="font-display font-bold text-2xl">Convite indisponível</h1>
            <p className="text-sm text-muted-foreground">Este link expirou, foi desativado ou já foi usado. Peça um novo à casa.</p>
            <Link to="/"><Button variant="outline">Voltar ao início</Button></Link>
          </>
        )}
        {preview && (
          <>
            <h1 className="font-display font-bold text-2xl">Convite de {preview.houseName}</h1>
            {preview.isOwner ? (
              <p className="text-sm text-muted-foreground">Este é o convite da sua própria casa. Envie o link para quem você quer receber.</p>
            ) : preview.alreadyMember ? (
              <>
                <p className="text-sm text-muted-foreground">Você já está na lista desta casa.</p>
                <Link to="/mensalidades"><Button>Ver minhas mensalidades</Button></Link>
              </>
            ) : (
              <>
                {preview.memberName && <p className="text-sm">A casa já cadastrou você como <strong>{preview.memberName}</strong>.</p>}
                <div className="rounded-xl bg-muted/60 p-4 text-sm space-y-2 pillow">
                  <p className="font-semibold">Ao aceitar, você concorda que:</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>a casa verá o seu nome, o seu vínculo, o valor e o dia da mensalidade e se está em dia;</li>
                    <li>você recebe avisos antes do vencimento e pode pagar pelo Ilê Conecta (Pix) ou direto com a casa;</li>
                    <li>você pode sair da lista quando quiser, e a casa também pode remover você;</li>
                    <li>combinados e reembolsos ficam entre você e a casa.</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void accept()}>{busy ? "Entrando…" : "Aceitar e entrar"}</Button>
                  <Link to="/"><Button variant="outline">Agora não</Button></Link>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
