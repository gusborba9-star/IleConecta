import { useState } from "react";
import type { Ritual } from "@/types";
import { Button, Modal } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { formatBRL } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function RitualPurchaseModal({ ritual, open, onClose }: { ritual: Ritual; open: boolean; onClose: () => void }) {
  const { buyRitual, getHouse, currentUser } = useApp();
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const nav = useNavigate();
  const house = getHouse(ritual.houseId);


  const confirm = () => {
    if (!currentUser) return;
    setProcessing(true);
    setTimeout(() => {
      const p = buyRitual(ritual.id);
      setProcessing(false);
      if (!p) {
        toast.error("Não foi possível simular a reserva. Verifique a disponibilidade.");
        return;
      }
      setDone(true);
      toast.success("Simulação registrada neste navegador. Nenhuma cobrança foi feita.");
    }, 900);
  };

  return (
    <Modal open={open} onClose={onClose} title={done ? "Simulação concluída" : "Simular reserva"} maxWidth="max-w-xl">
      {done ? (
        <div className="text-center space-y-4 py-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-forest/15 text-forest grid place-items-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="font-display text-2xl">Reserva demonstrativa registrada</h3>
          <p className="text-sm text-muted-foreground">
            Este registro existe apenas neste navegador. A casa não foi notificada e nenhuma vaga real foi reservada.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            <Button onClick={() => nav(`/mensagens/${ritual.houseId}`)}>Abrir chat</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <img src={ritual.cover} className="h-20 w-20 rounded-xl object-cover" />
            <div>
              <div className="text-xs text-muted-foreground">{house?.name}</div>
              <div className="font-display font-bold text-lg leading-tight">{ritual.title}</div>
              <div className="text-xs text-muted-foreground capitalize mt-0.5">Modalidade: {ritual.mode}</div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 bg-muted/40 space-y-2 text-sm">
            <Row label="Valor ilustrativo" value={formatBRL(ritual.price)} />
          </div>

          <div className="rounded-xl border border-border p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Meios de pagamento futuros</div>
              <div className="text-xs text-muted-foreground">Protótipo local: não há integração com Pix/cartão nem cobrança real.</div>
            </div>
            <span className="text-[10px] text-muted-foreground">DEMO</span>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirm} disabled={processing}>
              {processing ? "Simulando..." : "Simular reserva"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-display font-bold text-lg" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
