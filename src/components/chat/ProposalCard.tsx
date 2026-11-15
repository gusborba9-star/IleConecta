import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/base";
import ContractModal from "@/components/services/ContractModal";
import { cancelProposal, fetchProposalCard, type ProposalCardData } from "@/lib/proposals";
import { proposalStatusText } from "@/lib/proposalsCore";
import { fetchServiceForChat, type Service } from "@/lib/services";
import { formatCents } from "@/lib/servicesCore";

interface Props {
  proposalId: string;
  /** Dono da casa na conversa (a rota /mensagens/:id do cliente); os modais usam para saber se há pagamento. */
  onChanged?: () => void;
}

/** Cartão "Serviço · dia e hora · valor — Confirmar e pagar" que a casa envia depois de combinar o horário. */
export default function ProposalCard({ proposalId, onChanged }: Props) {
  const [card, setCard] = useState<ProposalCardData | null | undefined>(undefined);
  const [service, setService] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setCard(await fetchProposalCard(proposalId)), [proposalId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (card === undefined) return <div className="mt-2 text-xs text-muted-foreground">Carregando proposta…</div>;
  if (card === null) return <div className="mt-2 text-xs text-muted-foreground">Proposta não disponível.</div>;

  const open = async () => {
    setBusy(true);
    const found = await fetchServiceForChat(card.serviceId);
    setBusy(false);
    if (found) setService(found);
    else toast.error("Este serviço não está mais disponível.");
  };
  const cancel = async () => {
    setBusy(true);
    const error = await cancelProposal(card.id);
    setBusy(false);
    if (error) toast.error(error);
    await load();
    onChanged?.();
  };

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-3 text-sm text-foreground" data-testid="proposal-card">
      <div className="flex items-start gap-2">
        <CalendarCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold">{card.serviceTitle}</div>
          <div>{card.when} (Brasília)</div>
          <div className="text-muted-foreground">{card.priceCents > 0 ? formatCents(card.priceCents) : "Sem valor"}</div>
        </div>
      </div>
      {card.status === "aberta" ? (
        card.viewerIsHouse ? (
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Aguardando o cliente confirmar e pagar</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>Cancelar proposta</Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void open()}><CreditCard className="h-4 w-4" /> {busy ? "Abrindo…" : "Confirmar e pagar"}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}>Recusar</Button>
          </div>
        )
      ) : (
        <div className="mt-2 text-xs font-semibold text-muted-foreground">{proposalStatusText(card.status, card.viewerIsHouse)}</div>
      )}
      <ContractModal
        service={service}
        proposal={service ? { id: card.id, whenText: card.when } : undefined}
        onClose={() => { setService(null); void load(); }}
        onDone={() => { setService(null); void load(); onChanged?.(); }}
      />
    </div>
  );
}
