import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/base";
import { cancelMemberRequest, fetchMemberRequestState, inviteToMembership, requestMembership, respondMemberRequest, type MemberRequestState } from "@/lib/memberRequests";

/**
 * Faixa no chat para a adesão de membro a distância: a casa convida, a pessoa pede, o outro lado aceita ou recusa.
 * Some quando não se aplica (casa sem a área de membros, já é membro, bloqueio, tempo de espera depois de uma recusa).
 */
export default function MemberRequestCard({ otherId }: { otherId: string }) {
  const [s, setS] = useState<MemberRequestState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setS(await fetchMemberRequestState(otherId)), [otherId]);
  useEffect(() => {
    setS(null);
    void load();
    const t = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!s) return null;
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) toast.success(ok);
    else toast.error(r.error ?? "Não foi possível concluir agora.");
    await load();
  };

  const wrap = "mx-2 mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm sm:mx-3";
  const p = s.pending;
  if (p) {
    if (p.mine) {
      return (
        <div className={wrap} data-testid="member-request-card">
          <UserCheck className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden />
          <span className="min-w-0 flex-1">{p.direction === "pedido" ? `Pedido para ser membro de ${s.houseName} enviado. Aguardando a casa.` : "Convite para ser membro enviado. Aguardando a resposta."}</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => cancelMemberRequest(p.id), "Cancelado.")}>Cancelar</Button>
        </div>
      );
    }
    return (
      <div className={wrap} data-testid="member-request-card">
        <UserCheck className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden />
        <span className="min-w-0 flex-1">{p.direction === "convite" ? `${s.houseName} convidou você para ser membro da casa.` : "Esta pessoa pediu para ser membro da sua casa."}</span>
        <Button size="sm" disabled={busy} onClick={() => void run(() => respondMemberRequest(p.id, true), p.direction === "convite" ? "Você agora é membro da casa." : "Membro adicionado.")}>Aceitar</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => respondMemberRequest(p.id, false), "Recusado.")}>Recusar</Button>
      </div>
    );
  }
  if (s.isMember) return <div className={wrap} data-testid="member-request-card"><UserCheck className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden /><span>{s.iAmHouse ? "Esta pessoa é membro da sua casa." : `Você é membro de ${s.houseName}.`}</span></div>;
  if (!s.canStart) return null;
  return (
    <div className={wrap} data-testid="member-request-card">
      <UserCheck className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden />
      <span className="min-w-0 flex-1">{s.iAmHouse ? "Convidar esta pessoa para ser membro da casa?" : `Quer ser membro de ${s.houseName}?`}</span>
      {s.iAmHouse ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => inviteToMembership(otherId), "Convite enviado.")}>Convidar para ser membro</Button>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => requestMembership(otherId), "Pedido enviado.")}>Quero ser membro</Button>
      )}
    </div>
  );
}
