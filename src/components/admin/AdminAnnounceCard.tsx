import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input, Textarea } from "@/components/base";
import {
  ANNOUNCE_MAX, AUDIENCE_LABEL, LINK_OPTIONS, announceCount, announceProblem, announcementHistory, searchRecipients, sendAnnouncement,
  type AnnounceRow, type Audience, type Recipient,
} from "@/lib/announce";

/** Enviar aviso (notificação) para todos, só casas, só clientes ou pessoas escolhidas. */
export default function AdminAnnounceCard() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [href, setHref] = useState("");
  const [audience, setAudience] = useState<Audience>("todos");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Recipient[]>([]);
  const [picked, setPicked] = useState<Recipient[]>([]);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AnnounceRow[]>([]);

  const loadHistory = useCallback(async () => { try { setHistory(await announcementHistory()); } catch { /* sem histórico */ } }, []);
  useEffect(() => { if (open) void loadHistory(); }, [open, loadHistory]);
  useEffect(() => {
    if (audience !== "selecionados" || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => { void searchRecipients(q).then(setFound).catch(() => setFound([])); }, 300);
    return () => clearTimeout(t);
  }, [q, audience]);

  const problem = announceProblem(text, href, audience, picked.length);
  const reset = () => { setText(""); setHref(""); setPicked([]); setQ(""); setFound([]); setConfirm(null); };

  const prepare = async () => {
    if (problem) return void toast.error(problem);
    setBusy(true);
    try { setConfirm(audience === "selecionados" ? picked.length : await announceCount(audience)); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const n = await sendAnnouncement(text.trim(), href, audience, picked.map((p) => p.id));
      toast.success(`Aviso enviado para ${n} pessoa(s).`);
      reset(); await loadHistory();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5 space-y-3">
      <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><span className="font-display font-bold text-lg block">Enviar aviso</span><span className="text-sm text-muted-foreground">Notificação para todos, só casas, só clientes ou pessoas escolhidas.</span></span>
        <span className="text-primary font-semibold text-sm">{open ? "Fechar" : "Abrir"}</span>
      </button>
      {open && (
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="font-semibold">Para quem</span>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2" value={audience} onChange={(e) => { setAudience(e.target.value as Audience); setConfirm(null); }}>
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
            </select>
          </label>
          {audience === "selecionados" && (
            <div className="space-y-2">
              <Input aria-label="Buscar pessoa ou casa" placeholder="Buscar por nome da pessoa ou da casa (mínimo 2 letras)" value={q} onChange={(e) => setQ(e.target.value)} />
              {found.length > 0 && (
                <div className="rounded-md border border-border divide-y divide-border/60">
                  {found.map((r) => (
                    <button key={r.id} className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-50" disabled={picked.some((p) => p.id === r.id) || picked.length >= 200}
                      onClick={() => { setPicked([...picked, r]); setConfirm(null); }}>
                      {r.display_name}{r.house_name ? ` · ${r.house_name}` : ""} <span className="text-xs text-muted-foreground">({r.account_type === "casa" ? "casa" : "cliente"})</span>
                    </button>
                  ))}
                </div>
              )}
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {picked.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">
                      {p.house_name ?? p.display_name}
                      <button aria-label={`Remover ${p.display_name}`} className="text-muted-foreground hover:text-foreground" onClick={() => { setPicked(picked.filter((x) => x.id !== p.id)); setConfirm(null); }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <label className="block space-y-1"><span className="font-semibold">Texto do aviso <span className="font-normal text-muted-foreground">({text.trim().length}/{ANNOUNCE_MAX})</span></span>
            <Textarea rows={4} maxLength={ANNOUNCE_MAX + 50} value={text} onChange={(e) => { setText(e.target.value); setConfirm(null); }} placeholder="Escreva o aviso, curto e direto." />
          </label>
          <label className="block space-y-1"><span className="font-semibold">Link ao tocar (opcional)</span>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2" value={href} onChange={(e) => { setHref(e.target.value); setConfirm(null); }}>
              {LINK_OPTIONS.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
            </select>
          </label>
          {confirm === null ? (
            <Button disabled={busy || !!problem} onClick={() => void prepare()}>Revisar e enviar</Button>
          ) : (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="font-semibold">Confirme o envio para {confirm} pessoa(s) — {AUDIENCE_LABEL[audience]}. Não dá para desfazer.</p>
              <p className="rounded-md bg-muted/50 p-2">{text.trim()}</p>
              <div className="flex gap-2"><Button disabled={busy} onClick={() => void send()}>Enviar agora</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Voltar e editar</Button></div>
            </div>
          )}
          <div className="space-y-2 pt-2">
            <h3 className="font-semibold">Enviados</h3>
            {history.length === 0 && <p className="text-muted-foreground">Nenhum aviso enviado pelo painel ainda.</p>}
            {history.map((h) => (
              <div key={h.id} className="rounded-md border border-border/70 p-2">
                <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")} · {AUDIENCE_LABEL[h.audience]} · {h.recipients} pessoa(s)</div>
                <p>{h.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
