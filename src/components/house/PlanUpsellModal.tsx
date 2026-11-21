import { Button, Modal } from "@/components/base";

/** Aviso curto ao tocar numa ferramenta de plano superior: o que ela faz, em qual plano está e atalhos. */
export default function PlanUpsellModal({ tool, planName, onClose, onPlans, onHow, onBuy }: {
  tool: { title: string; about: string; note?: string; buyLabel?: string } | null;
  planName: string;
  onClose: () => void;
  onPlans: () => void;
  onHow?: () => void;
  /** Quando a ferramenta tem um jeito de usar no plano atual (ex.: pacotes de respostas da assistente). */
  onBuy?: () => void;
}) {
  return (
    <Modal open={!!tool} onClose={onClose} title={tool ? tool.title : undefined} maxWidth="max-w-md">
      {tool && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{tool.about}</p>
          <p className="rounded-2xl bg-gold/15 p-3 text-sm">{tool.note ?? <>Disponível a partir do plano <strong>{planName}</strong>.</>}</p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {tool.buyLabel && onBuy ? <Button variant="gold" className="w-full sm:w-auto" onClick={onBuy}>{tool.buyLabel}</Button> : null}
            <Button variant={(tool.buyLabel && onBuy) ? "outline" : "gold"} className="w-full sm:w-auto" onClick={onPlans}>Ver planos</Button>
            {(tool.buyLabel && onBuy) || !onHow ? null : <Button variant="outline" className="w-full sm:w-auto" onClick={onHow}>Ver como funciona</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
