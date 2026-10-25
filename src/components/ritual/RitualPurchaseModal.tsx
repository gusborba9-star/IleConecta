import { useState } from "react";
import type { Ritual } from "@/types";
import { Button, Modal } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { formatBRL } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function RitualPurchaseModal({ ritual, open, onClose }: { ritual: Ritual; open: boolean; onClose: () => void }) {
  const { buyRitual, getHouse, currentUser } = useApp();
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const nav = useNavigate();
  const house = getHouse(ritual.houseId);

  const platformFee = +(ritual.price * (ritual.platformFeePct / 100)).toFixed(2);
  const houseReceives = +(ritual.price - platformFee).toFixed(2);

  const confirm = () => {
    if (!currentUser) return;
    setProcessing(true);
    setTimeout(() => {
      const p = buyRitual(ritual.id);
      setProcessing(false);
      if (!p) {
        toast.error("Vagas esgotadas para este ritual");
        return onClose();
      }
      setDone(true);
      toast.success("Vaga confirmada! Boa jornada espiritual 🙏");
    }, 900);
  };

  return (
    <Modal open={open} onClose={onClose} title={done ? "Vaga confirmada" : "Contratar ritual"} maxWidth="max-w-xl">
      {done ? (
        <div className="text-center space-y-4 py-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-forest/15 text-forest grid place-items-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="font-display text-2xl">Axé! Sua vaga foi reservada</h3>
          <p className="text-sm text-muted-foreground">
            {house?.name} entrará em contato pelo chat para orientar sua participação.
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
            <Row label="Valor da vaga" value={formatBRL(ritual.price)} />
            <Row label={`Taxa da plataforma (${ritual.platformFeePct}%)`} value={formatBRL(platformFee)} muted />
            <Row label="A casa recebe" value={formatBRL(houseReceives)} muted />
            <div className="border-t border-border pt-2 mt-2">
              <Row label="Total a pagar" value={formatBRL(ritual.price)} bold />
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Cartão de crédito · Pix</div>
              <div className="text-xs text-muted-foreground">Pagamento simulado no ambiente demo</div>
            </div>
            <ShieldCheck className="h-5 w-5 text-forest" />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirm} disabled={processing}>
              {processing ? "Processando..." : `Pagar ${formatBRL(ritual.price)}`}
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
