import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/base";
import { decideWaiting, type WaitingPerson } from "@/lib/video";

export default function WaitingPanel({ meetingId, list, onChanged, onClose }: { meetingId: string; list: WaitingPerson[]; onChanged: () => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const decide = async (decision: "admitir" | "negar", users: string[] | null, all = false) => {
    setBusy(true);
    const n = await decideWaiting(meetingId, decision, users, all);
    setBusy(false);
    if (n < 0) return void toast.error("Não consegui registrar. Tente de novo.");
    setPicked([]);
    toast.success(decision === "admitir" ? (n === 1 ? "1 pessoa liberada." : `${n} pessoas liberadas.`) : (n === 1 ? "Entrada negada." : `${n} entradas negadas.`));
    onChanged();
  };
  return (
    <section className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] min-h-40 flex-col border-t border-border bg-card shadow-lg" aria-label="Sala de espera" data-testid="video-waiting-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-sm font-semibold">Sala de espera ({list.length})</h2>
        <button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold hover:bg-muted" onClick={onClose}>Fechar</button>
      </div>
      {list.length === 0 ? <p className="px-3 pb-4 text-sm text-muted-foreground">Ninguém esperando agora. Quem pedir para entrar aparece aqui.</p> : (
        <>
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("admitir", null, true)} data-testid="video-admit-all">Liberar todos</Button>
            <Button size="sm" variant="outline" disabled={busy || picked.length === 0} onClick={() => void decide("admitir", picked)} data-testid="video-admit-picked">Liberar escolhidos ({picked.length})</Button>
            <Button size="sm" variant="outline" disabled={busy || picked.length === 0} onClick={() => void decide("negar", picked)} className="border-destructive text-destructive" data-testid="video-deny-picked">Negar escolhidos</Button>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-3 pb-3">
            {list.map((w) => (
              <li key={w.userId} className="flex items-center gap-3 py-1.5 text-sm" data-testid="video-waiting-row">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={picked.includes(w.userId)} onChange={() => toggle(w.userId)} aria-label={`Escolher ${w.name}`} />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                </label>
                <button type="button" disabled={busy} onClick={() => void decide("admitir", [w.userId])} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Liberar</button>
                <button type="button" disabled={busy} onClick={() => void decide("negar", [w.userId])} className="min-h-9 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive">Negar</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
