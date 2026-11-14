import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { accountStatus, cancelDeletion, requestDeletion, type AccountStatus } from "@/lib/support";
import { downloadMyData } from "@/lib/accountGate";

/** Ferramentas da própria conta: exportar dados e pedir/cancelar a exclusão (7 dias de reflexão). */
export default function AccountTools() {
  const [st, setSt] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => { const r = await accountStatus(); if (r.ok) setSt(r.data); }, []);
  useEffect(() => { void load(); }, [load]);

  const download = async () => {
    setBusy(true);
    const err = await downloadMyData();
    setBusy(false);
    if (err) toast.error(err);
  };

  const ask = async () => {
    if (confirm !== "EXCLUIR") return void toast.error("Digite EXCLUIR para confirmar.");
    setBusy(true);
    const r = await requestDeletion();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setAsking(false); setConfirm("");
    toast.success("Pedido registrado. Você tem 7 dias para desistir.");
    await load();
  };

  const cancel = async () => {
    setBusy(true);
    const r = await cancelDeletion();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Exclusão cancelada.");
    await load();
  };

  if (!st) return null;
  return (
    <Card className="p-6 space-y-3">
      <h2 className="font-display font-bold text-lg">Minha conta e meus dados</h2>
      {st.suspensa && <p role="alert" className="text-sm text-destructive">Sua conta está suspensa. Abra um chamado do tipo “Acesso à conta” para entender o motivo.</p>}
      <div>
        <Button variant="outline" onClick={() => void download()} disabled={busy}>Baixar meus dados</Button>
        <p className="text-xs text-muted-foreground mt-1">Um arquivo com o que a plataforma guarda sobre você.</p>
      </div>
      <div className="border-t border-border/60 pt-3 space-y-2">
        {st.exclusao ? (
          <>
            <p className="text-sm">Exclusão agendada para <strong>{new Date(st.exclusao.executa_em).toLocaleDateString("pt-BR")}</strong>. Até lá você pode desistir.</p>
            <Button variant="outline" onClick={() => void cancel()} disabled={busy}>Cancelar a exclusão</Button>
          </>
        ) : asking ? (
          <div className="space-y-2">
            <p className="text-sm">Seu perfil, mensagens e dados pessoais serão apagados ou anonimizados após 7 dias. Pagamentos, reembolsos e aceites dos Termos são guardados por até 5 anos por obrigação legal e proteção de todos, junto com a identificação de quem era o titular (visível só à administração). Se você criar uma nova conta com o mesmo e-mail, ela é identificada como conta que voltou, e essa conta não inclui o reembolso de 7 dias do plano.</p>
            {st.impedimentos.length > 0 && (
              <div className="text-sm text-destructive">
                <p className="font-medium">Não é possível excluir a conta agora:</p>
                <ul className="list-disc pl-5">{st.impedimentos.map((i) => <li key={i}>{i}</li>)}</ul>
                <p className="mt-1 text-muted-foreground">Resolva o que está listado e volte aqui. Nenhuma cobrança nova é criada por causa deste pedido.</p>
              </div>
            )}
            <Input aria-label="Digite EXCLUIR" placeholder="Digite EXCLUIR" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <div className="flex gap-2"><Button variant="danger" onClick={() => void ask()} disabled={busy || st.impedimentos.length > 0}>Pedir exclusão</Button><Button variant="ghost" onClick={() => setAsking(false)}>Voltar</Button></div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setAsking(true)}>Excluir minha conta</Button>
        )}
      </div>
    </Card>
  );
}
