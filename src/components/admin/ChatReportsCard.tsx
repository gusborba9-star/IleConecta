import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { REPORT_REASONS } from "@/lib/messaging";
import { supabase } from "@/lib/supabase";

interface Snap { at: string; sender: string; assistant: boolean; text: string; deleted?: boolean }
interface Row {
  id: string; reporter_name: string; reported_name: string; reason: string; details: string | null;
  snapshot: Snap[]; status: "aberta" | "resolvida"; admin_note: string | null; created_at: string;
}

/** Denúncias do chat. Só aparecem as conversas que alguém denunciou (últimas 30 mensagens). */
export default function ChatReportsCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_chat_reports");
    setRows((data as Row[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_resolve_chat_report", { p_id: id, p_note: notes[id] ?? "" });
    if (error) return void toast.error("Não foi possível concluir.");
    toast.success("Denúncia resolvida.");
    await load();
  };

  const reason = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
  const openCount = rows.filter((r) => r.status === "aberta").length;

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Denúncias do chat {openCount > 0 && <span className="text-sm text-destructive">({openCount} abertas)</span>}</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma denúncia até agora.</p>}
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border border-border/70 p-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="font-semibold">{r.reporter_name}</span> denunciou <span className="font-semibold">{r.reported_name}</span> · {reason(r.reason)}</div>
            <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")} · {r.status === "aberta" ? "aberta" : "resolvida"}</div>
          </div>
          {r.details && <p className="text-muted-foreground">“{r.details}”</p>}
          <button className="text-primary font-semibold" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Ocultar mensagens" : "Ver mensagens da denúncia"}</button>
          {open === r.id && (
            <div className="max-h-64 overflow-y-auto rounded-md bg-muted/40 p-2 space-y-1">
              {r.snapshot.map((m, i) => (
                <div key={i} className="text-xs"><span className="text-muted-foreground">{new Date(m.at).toLocaleString("pt-BR")}{m.assistant ? " · assistente" : ""}{m.deleted ? " · apagada pelo autor" : ""}:</span> {m.text}</div>
              ))}
            </div>
          )}
          {r.status === "aberta" ? (
            <div className="flex gap-2">
              <Input aria-label="Nota" placeholder="Nota da decisão (opcional)" maxLength={500} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <Button size="sm" onClick={() => void resolve(r.id)}>Resolver</Button>
            </div>
          ) : r.admin_note ? <p className="text-xs text-muted-foreground">Nota: {r.admin_note}</p> : null}
        </div>
      ))}
    </Card>
  );
}
