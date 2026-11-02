import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/base";
import ReserveModal from "@/components/rituals/ReserveModal";
import ContractModal from "@/components/services/ContractModal";
import { fetchHouseRituals, type RealRitual } from "@/lib/rituals";
import { fetchServices, type Service } from "@/lib/services";

interface Props {
  action: { target: "ritual" | "service"; id: string };
  /** Dono da casa (a rota do chat já é /mensagens/:id dele, que os modais usam para saber se há pagamento). */
  ownerId: string;
}

/** Botão "Ir para o pagamento" que a assistente coloca no chat; abre o mesmo fluxo da página da casa (reserva com 15 min de vaga). */
export default function ChatCheckoutButton({ action, ownerId }: Props) {
  const [busy, setBusy] = useState(false);
  const [ritual, setRitual] = useState<RealRitual | null>(null);
  const [service, setService] = useState<Service | null>(null);

  const open = async () => {
    setBusy(true);
    if (action.target === "ritual") {
      const found = (await fetchHouseRituals(ownerId)).find((r) => r.id === action.id) ?? null;
      if (found) setRitual(found);
      else toast.error("Este ritual não está mais disponível.");
    } else {
      const found = (await fetchServices(ownerId)).find((s) => s.id === action.id && s.active) ?? null;
      if (found) setService(found);
      else toast.error("Este serviço não está mais disponível.");
    }
    setBusy(false);
  };

  return (
    <>
      <Button size="sm" className="mt-2" disabled={busy} onClick={() => void open()}>
        <CreditCard className="h-4 w-4" /> {busy ? "Abrindo…" : "Ir para o pagamento"}
      </Button>
      <ReserveModal ritual={ritual} onClose={() => setRitual(null)} onDone={() => setRitual(null)} />
      <ContractModal service={service} onClose={() => setService(null)} onDone={() => setService(null)} />
    </>
  );
}
