import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card } from "@/components/base";
import { Stars } from "@/components/reviews/Stars";
import { fetchReportedReviews, setReviewHidden, type ReportedReview } from "@/lib/reviews";

/** Avaliações contestadas pelas casas: a administração decide se esconde ou mantém. */
export default function ReportedReviewsCard() {
  const [items, setItems] = useState<ReportedReview[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await fetchReportedReviews()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (r: ReportedReview) => {
    setBusy(r.id);
    const error = await setReviewHidden(r.id, !r.hidden);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success(r.hidden ? "Avaliação voltou a aparecer." : "Avaliação escondida.");
    void load();
  };

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Avaliações contestadas</h2>
      {items === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma avaliação contestada.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl border border-border p-3 space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} size={14} /><span className="font-semibold">{r.house}</span><span className="text-xs text-muted-foreground">{r.hidden ? "· escondida" : "· visível"}</span></div>
              {r.comment && <p className="whitespace-pre-line">“{r.comment}”</p>}
              <p className="text-xs text-muted-foreground">Motivo da casa: {r.reason}</p>
              <Button size="sm" variant={r.hidden ? "outline" : "danger"} disabled={busy === r.id} onClick={() => void toggle(r)}>{r.hidden ? "Voltar a mostrar" : "Esconder avaliação"}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
