import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Button, Card, Textarea } from "@/components/base";
import { contestModeration, myModerationFlags, type MyModerationRow } from "@/lib/moderation";
import { CONTEST_DAYS, REASON_LABEL, STATUS_LABEL, TARGET_LABEL, canContest, houseMessage } from "@/lib/moderationCore.js";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "");

/** Avisos de moderação da casa: orientação, advertência, anúncio ocultado e contestação. */
export default function Moderation() {
  const [rows, setRows] = useState<MyModerationRow[] | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await myModerationFlags()); } catch (e) { toast.error((e as Error).message); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (id: string) => {
    setBusy(true);
    try { await contestModeration(id, text[id] ?? ""); toast.success("Contestação enviada. A administração vai responder por aqui."); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-4 max-w-3xl">
      <Card className="page-hero p-6">
        <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /><h1 className="font-display font-bold text-2xl">Avisos de moderação</h1></div>
        <p className="text-sm text-muted-foreground mt-1">Orientações e avisos da administração sobre os seus anúncios. As regras estão na página <Link className="text-primary font-semibold hover:underline" to="/sobre/novidades-seguranca">Novidades de segurança e transparência</Link>.</p>
      </Card>
      {rows === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {rows?.length === 0 && <Card className="p-5 text-sm text-muted-foreground">Nenhum aviso. Está tudo certo com os seus anúncios.</Card>}
      {rows?.map((r) => {
        const msg = houseMessage(r);
        const can = canContest({ ...r, contested_at: r.contested_at });
        return (
          <Card key={r.id} className="p-5 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{TARGET_LABEL[r.target_table]} · {REASON_LABEL[r.reason]}</div>
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[r.status]}</div>
            </div>
            <p className="rounded-md bg-muted/40 p-2 text-muted-foreground">“{r.excerpt}”</p>
            <div className="space-y-1"><p className="font-semibold">{msg[0]}</p>{msg.slice(1).map((p, i) => <p key={i}>{p}</p>)}</div>
            {r.status === "advertida" && r.deadline_at && <p className="text-xs"><b>Prazo para ajustar:</b> até {fmt(r.deadline_at)}</p>}
            {r.admin_note && <p className="text-xs text-muted-foreground"><b>Observação da administração:</b> {r.admin_note}</p>}
            {r.contest_text && <p className="text-xs text-muted-foreground"><b>Sua contestação ({fmt(r.contested_at)}):</b> {r.contest_text}</p>}
            {r.contest_decision === "mantida" && <p className="text-xs"><b>Resposta:</b> a decisão foi mantida após a análise.</p>}
            {can && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">Você pode contestar até {fmt(r.contest_until)} ({CONTEST_DAYS} dias corridos). Explique por que o texto está de acordo.</p>
                <Textarea aria-label="Contestação" rows={3} maxLength={2000} value={text[r.id] ?? ""} onChange={(e) => setText({ ...text, [r.id]: e.target.value })} placeholder="Explique o motivo da sua contestação" />
                <Button size="sm" disabled={busy || (text[r.id] ?? "").trim().length < 10} onClick={() => void send(r.id)}>Enviar contestação</Button>
              </div>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">Dúvidas? Fale com o <Link to="/suporte" className="text-primary font-semibold hover:underline">Suporte</Link>.</p>
    </div>
  );
}
