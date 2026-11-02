import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Flag, MessageSquareReply, ShieldCheck } from "lucide-react";
import { Button, Card } from "@/components/base";
import { Stars, StarPicker } from "@/components/reviews/Stars";
import {
  fetchHouseReviews,
  fetchReviewable,
  replyReview,
  reportReview,
  submitReview,
  type HouseReviews,
  type Reviewable,
  type ReviewItem,
} from "@/lib/reviews";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Avaliações de quem comprou da casa. Só a pessoa que concluiu uma compra pode avaliar; a casa pode responder e contestar. */
export default function ReviewsTab({ ownerId, isOwn, canReview, onlyRef, onShowAll }: { ownerId: string; isOwn: boolean; canReview: boolean; onlyRef?: string | null; onShowAll?: () => void }) {
  const [data, setData] = useState<HouseReviews | null>(null);
  const [pending, setPending] = useState<Reviewable[]>([]);

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([fetchHouseReviews(ownerId), canReview && !isOwn ? fetchReviewable() : Promise.resolve([])]);
    setData(d);
    setPending(p.filter((x) => x.houseOwnerId === ownerId));
  }, [ownerId, canReview, isOwn]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>;
  const max = Math.max(1, ...Object.values(data.dist));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-display font-bold text-lg">Avaliações de quem comprou</h2></div>
        <p className="text-xs text-muted-foreground mb-3">Só quem concluiu um serviço ou participou de um ritual desta casa pode avaliar.</p>
        {data.count === 0 ? (
          <p className="text-sm text-muted-foreground">Esta casa ainda não tem avaliações.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div className="text-center">
              <div className="font-display font-bold text-4xl">{data.avg.toFixed(1)}</div>
              <Stars value={data.avg} />
              <div className="text-xs text-muted-foreground mt-1">{data.count} {data.count === 1 ? "avaliação" : "avaliações"}</div>
            </div>
            <div className="flex-1 min-w-[180px] space-y-1">
              {([5, 4, 3, 2, 1] as const).map((s) => (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-3">{s}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-gold" style={{ width: `${(data.dist[String(s) as "1"] / max) * 100}%` }} /></div>
                  <span className="w-6 text-right text-muted-foreground">{data.dist[String(s) as "1"]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {(onlyRef ? pending.filter((p) => p.ref === onlyRef) : pending).map((p) => <ReviewForm key={`${p.kind}-${p.ref}`} item={p} onDone={() => void load()} />)}
      {onlyRef && pending.some((p) => p.ref !== onlyRef) && onShowAll && (
        <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={onShowAll}>Avaliar outras compras ({pending.filter((p) => p.ref !== onlyRef).length})</button>
      )}

      {data.items.map((r) => <ReviewCard key={r.id} r={r} isOwn={isOwn} onChanged={() => void load()} />)}
    </div>
  );
}

function ReviewForm({ item, onDone }: { item: Reviewable; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (rating < 1) return void toast.error("Escolha de 1 a 5 estrelas.");
    setBusy(true);
    const error = await submitReview(item.kind, item.ref, rating, comment, anonymous);
    setBusy(false);
    if (error) return void toast.error(error);
    toast.success("Avaliação enviada. Obrigado!");
    onDone();
  };

  return (
    <Card className="p-5 space-y-3 border-gold/50">
      <div>
        <div className="font-display font-bold text-lg">Como foi a sua experiência?</div>
        <div className="text-sm text-muted-foreground">{item.kind === "ritual" ? "Ritual" : "Serviço"}: {item.title || item.houseName}</div>
      </div>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        aria-label="Comentário (opcional)"
        className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm"
        placeholder="Conte como foi (opcional). Não compartilhe dados pessoais."
        maxLength={600}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        Avaliar sem mostrar meu nome (aparece como "Cliente")
      </label>
      <Button onClick={() => void send()} disabled={busy}>{busy ? "Enviando…" : "Enviar avaliação"}</Button>
    </Card>
  );
}

function ReviewCard({ r, isOwn, onChanged }: { r: ReviewItem; isOwn: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<null | "reply" | "report">(null);
  const [text, setText] = useState(r.reply ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const error = mode === "reply" ? await replyReview(r.id, text) : await reportReview(r.id, text);
    setBusy(false);
    if (error) return void toast.error(error);
    toast.success(mode === "reply" ? "Resposta publicada." : "Contestação enviada para a administração.");
    setMode(null);
    onChanged();
  };

  return (
    <Card className="p-5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={r.rating} />
        <span className="font-semibold text-sm">{r.author}{r.mine ? " (você)" : ""}</span>
        <span className="text-xs text-muted-foreground">· {fmt(r.createdAt)} · compra verificada</span>
      </div>
      {r.comment && <p className="text-sm whitespace-pre-line">{r.comment}</p>}
      {r.reply && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm pillow">
          <div className="text-xs font-semibold mb-0.5">Resposta da casa</div>
          <p className="whitespace-pre-line">{r.reply}</p>
        </div>
      )}
      {isOwn && mode === null && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => setMode("reply")}><MessageSquareReply className="h-4 w-4" /> {r.reply ? "Editar resposta" : "Responder"}</Button>
          {!r.reported && <Button size="sm" variant="ghost" onClick={() => { setText(""); setMode("report"); }}><Flag className="h-4 w-4" /> Contestar</Button>}
          {r.reported && <span className="text-xs text-muted-foreground self-center">Contestação em análise.</span>}
        </div>
      )}
      {isOwn && mode !== null && (
        <div className="space-y-2 pt-1">
          <textarea
            aria-label={mode === "reply" ? "Sua resposta" : "Motivo da contestação"}
            className="w-full min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm"
            placeholder={mode === "reply" ? "Agradeça ou esclareça com respeito." : "Explique por que esta avaliação não corresponde ao atendimento."}
            maxLength={mode === "reply" ? 600 : 300}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void submit()} disabled={busy || text.trim().length < (mode === "reply" ? 1 : 5)}>{busy ? "Enviando…" : mode === "reply" ? "Publicar resposta" : "Enviar contestação"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
