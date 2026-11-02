import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { acceptStaffInvite } from "@/lib/staff";

/** Quem recebe o link da equipe aceita aqui, já logado na própria conta. */
export default function EquipeConvite() {
  const { token = "" } = useParams();
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!currentUser) return <Navigate to="/login" state={{ from: `/equipe/convite/${token}` }} replace />;
  const accept = async () => {
    setBusy(true);
    const r = await acceptStaffInvite(token);
    setBusy(false);
    if (r.error) return void toast.error(r.error);
    toast.success(`Pronto! Você atende pela casa ${r.houseName}.`);
    window.location.assign("/atendimento");
  };
  return (
    <div className="max-w-lg mx-auto pb-16 lg:pb-4">
      <Card className="p-6 space-y-4">
        <h1 className="font-display font-bold text-2xl">Convite para atender pela casa</h1>
        {currentUser.type === "commercial" || !isRemoteAuth ? (
          <p className="text-sm text-muted-foreground">Para atender pela casa de outra pessoa, entre com uma conta de cliente.</p>
        ) : (
          <>
            <div className="pillow rounded-xl bg-muted/60 p-4 text-sm space-y-1">
              <p className="font-semibold">Ao aceitar, você concorda que:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>responde os clientes em nome da casa, e eles veem “Atendido por” com o seu nome;</li>
                <li>vê só o que a casa liberou para você;</li>
                <li>a casa pode mudar o seu acesso ou retirá-lo a qualquer momento.</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void accept()}>{busy ? "Entrando…" : "Aceitar e começar"}</Button>
              <Button variant="outline" onClick={() => nav("/")}>Agora não</Button>
            </div>
          </>
        )}
        <Link to="/" className="text-sm text-primary font-semibold">Voltar ao início</Link>
      </Card>
    </div>
  );
}
