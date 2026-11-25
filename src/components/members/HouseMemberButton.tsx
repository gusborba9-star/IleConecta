import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/base";
import { fetchMemberRequestState, requestMembership, type MemberRequestState } from "@/lib/memberRequests";

/** Botão "Quero ser membro" da página da casa: pedido único; só vira vínculo se a casa aceitar. Some quando não se aplica. */
export default function HouseMemberButton({ ownerId }: { ownerId: string }) {
  const [s, setS] = useState<MemberRequestState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setS(await fetchMemberRequestState(ownerId)), [ownerId]);
  useEffect(() => { void load(); }, [load]);
  if (!s || s.isMember) return null;
  const waiting = Boolean(s.pending);
  if (!waiting && !s.canStart) return null;
  const cls = "h-auto min-h-11 min-w-0 flex-1 px-3 py-2 leading-tight";
  if (waiting) return <Button variant="outline" className={cls} disabled title="Veja a conversa com a casa"><Users className="h-4 w-4 shrink-0" aria-hidden /> {s.pending?.direction === "convite" ? "Convite recebido" : "Pedido enviado"}</Button>;
  return (
    <Button variant="outline" className={cls} disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await requestMembership(ownerId);
      setBusy(false);
      if (r.ok) toast.success("Pedido enviado. A casa responde pela conversa."); else toast.error(r.error ?? "Não foi possível enviar agora.");
      await load();
    }}><Users className="h-4 w-4 shrink-0" aria-hidden /> Quero ser membro</Button>
  );
}
