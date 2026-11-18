import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import { REPORT_REASONS } from "@/lib/momentsCore";
import { momentUrl } from "@/lib/moments";
import { supabase } from "@/lib/supabase";

interface Row { story_id: string; house_name: string; caption: string | null; media_kind: string; media_path: string | null; poster_path: string | null; first_report: string; n_reports: number; reasons: string[]; hidden: boolean }

/** Denúncias de momentos. Três pessoas diferentes escondem o momento sozinho; aqui a administração decide manter ou remover. */
export default function MomentReportsCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_moment_reports");
    setRows((data as Row[] | null) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, action: "manter" | "remover") => {
    if (!supabase) return;
    setBusy(id);
    const { error } = await supabase.rpc("admin_moment_decide", { p_story: id, p_action: action, p_note: notes[id] ?? null });
    setBusy(null);
    if (error) return void toast.error("Não foi possível concluir.");
    toast.success(action === "manter" ? "Momento mantido no ar." : "Momento removido.");
    await load();
  };
  const reason = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display font-bold text-lg">Denúncias de momentos {rows.length > 0 && <span className="text-sm text-destructive">({rows.length} abertas)</span>}</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma denúncia aberta.</p>}
      {rows.map((r) => {
        const src = r.media_path ? (r.media_kind === "video" ? (r.poster_path && momentUrl(r.poster_path)) : momentUrl(r.media_path)) : undefined;
        return (
          <div key={r.story_id} className="rounded-lg border border-border/70 p-3 text-sm flex flex-col sm:flex-row gap-3">
            {src ? <img src={src} alt="Momento denunciado" className="h-40 w-24 object-cover rounded-md bg-muted shrink-0" /> : <div className="h-40 w-24 rounded-md bg-muted grid place-items-center text-xs text-muted-foreground shrink-0">sem arquivo</div>}
            <div className="flex-1 space-y-2">
              <div><span className="font-semibold">{r.house_name}</span> · {r.media_kind === "video" ? "vídeo" : "foto"} · {r.n_reports} {r.n_reports === 1 ? "denúncia" : "denúncias"} {r.hidden && <span className="text-destructive font-semibold">· escondido</span>}</div>
              <div className="text-muted-foreground">{r.reasons.map(reason).join(", ")} · desde {new Date(r.first_report).toLocaleString("pt-BR")}</div>
              {r.caption && <p className="text-muted-foreground">“{r.caption}”</p>}
              <Input aria-label="Observação" placeholder="Observação (opcional)" value={notes[r.story_id] ?? ""} maxLength={300} onChange={(e) => setNotes((n) => ({ ...n, [r.story_id]: e.target.value }))} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === r.story_id} onClick={() => void decide(r.story_id, "manter")}>Manter no ar</Button>
                <Button size="sm" disabled={busy === r.story_id} onClick={() => void decide(r.story_id, "remover")}>Remover</Button>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
