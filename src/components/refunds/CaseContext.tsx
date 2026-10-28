import { useState } from "react";
import { Button } from "@/components/base";
import { fetchRefundContext, type RefundContext } from "@/lib/refunds";
import { formatCents } from "@/lib/servicesCore";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Fatos do caso para a administração decidir: linha do tempo, o que foi contratado e a conversa entre cliente e casa. */
export default function CaseContext({ refundId }: { refundId: string }) {
  const [ctx, setCtx] = useState<RefundContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setLoading(true);
    const res = await fetchRefundContext(refundId);
    setLoading(false);
    if (res.error) setError(res.error);
    else setCtx(res.context);
  };

  if (!ctx) {
    return (
      <div className="mt-3">
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void open()}>{loading ? "Abrindo…" : "Ver contexto do caso"}</Button>
        {error && <p className="text-sm text-[hsl(var(--danger))] mt-2">{error}</p>}
        <p className="text-xs text-muted-foreground mt-1">Abrir o contexto mostra a conversa entre cliente e casa e fica registrado no seu nome.</p>
      </div>
    );
  }

  const start = ctx.timeline.find((t) => t.label.includes("iniciou"));
  const asked = ctx.timeline.find((t) => t.label.startsWith("Cliente pediu"));
  const minutes = start && asked ? Math.max(0, Math.round((new Date(asked.at).getTime() - new Date(start.at).getTime()) / 60000)) : null;
  const finished = ctx.timeline.some((t) => t.label.includes("concluí") || t.label.includes("concluiu"));

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 space-y-3 text-sm">
      <div>
        <div className="font-semibold">{ctx.title} · {formatCents(ctx.price_cents)}</div>
        {ctx.description && <p className="text-muted-foreground whitespace-pre-line mt-1">{ctx.description}</p>}
        {ctx.client_note && <p className="mt-1"><span className="text-muted-foreground">Pedido do cliente: </span>{ctx.client_note}</p>}
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Linha do tempo</div>
        <ul className="space-y-0.5">
          {ctx.timeline.map((t, i) => (
            <li key={i} className="flex gap-2"><span className="text-muted-foreground w-28 shrink-0">{fmt(t.at)}</span><span>{t.label}</span></li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-2">
          {finished ? "A casa marcou a entrega como concluída." : "A casa ainda não marcou a entrega como concluída."}
          {minutes !== null && ` O relato veio ${minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`} depois do início.`}
        </p>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Conversa entre cliente e casa (desde a contratação)</div>
        {ctx.same_person ? (
          <p className="text-muted-foreground">Cliente e casa são a mesma conta (teste): não há conversa para mostrar.</p>
        ) : ctx.messages.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma mensagem desde a contratação. Sem conversa, não há registro do que foi combinado fora do pedido.</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {ctx.messages.map((m, i) => (
              <li key={i}>
                <span className="text-xs text-muted-foreground">{fmt(m.at)} · {m.from === "cliente" ? "Cliente" : m.from === "casa" ? "Casa" : "Assistente da casa"}</span>
                <div className="whitespace-pre-line">{m.text}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
