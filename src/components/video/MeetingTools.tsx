import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/base";
import { fetchHelpers, fetchHouseMembers, fetchPresence, setHelper, type Helper, type HouseMemberOption, type PresenceRow } from "@/lib/video";
import { ROLE_LABEL, presenceCsv, presenceSummary } from "@/lib/videoCore";

const selectCls = "h-11 w-full rounded-[14px] border border-input bg-card px-3 text-sm";

/** Equipe da reunião: a dona indica membros como coanfitrião (libera, retira e encerra) ou moderador (libera e retira). */
export function HelpersEditor({ meetingId, houseId }: { meetingId: string; houseId: string }) {
  const [helpers, setHelpers] = useState<Helper[] | null>(null);
  const [members, setMembers] = useState<HouseMemberOption[]>([]);
  const [user, setUser] = useState("");
  const [role, setRole] = useState<"coanfitriao" | "moderador">("moderador");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setHelpers(await fetchHelpers(meetingId)); }, [meetingId]);
  useEffect(() => { void load(); void fetchHouseMembers(houseId).then(setMembers); }, [load, houseId]);
  const free = useMemo(() => members.filter((m) => !(helpers ?? []).some((h) => h.userId === m.userId)), [members, helpers]);
  const add = async () => {
    if (!user) return void toast.error("Escolha um membro.");
    setBusy(true);
    const r = await setHelper(meetingId, user, role);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Não consegui indicar.");
    toast.success("Pessoa indicada. Ela foi avisada.");
    setUser("");
    void load();
  };
  const drop = async (h: Helper) => {
    const r = await setHelper(meetingId, h.userId, null);
    if (!r.ok) return void toast.error(r.error ?? "Não consegui tirar a função.");
    void load();
  };
  return (
    <div className="space-y-2 rounded-[14px] border border-border p-3" data-testid="video-helpers">
      <h3 className="text-sm font-semibold">Equipe da reunião</h3>
      <p className="text-xs text-muted-foreground">Coanfitrião libera a entrada, retira pessoas e encerra a reunião. Moderador libera a entrada e retira pessoas.</p>
      {helpers === null ? <p className="text-xs text-muted-foreground" role="status">Carregando…</p>
        : helpers.length === 0 ? <p className="text-xs text-muted-foreground">Ninguém indicado ainda.</p>
        : (
          <ul className="divide-y divide-border">
            {helpers.map((h) => (
              <li key={h.userId} className="flex items-center gap-2 py-1.5 text-sm" data-testid="video-helper-row">
                <span className="min-w-0 flex-1 truncate">{h.name} <span className="text-xs text-muted-foreground">· {ROLE_LABEL[h.role]}</span></span>
                <button type="button" onClick={() => void drop(h)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-destructive hover:bg-muted">Tirar função</button>
              </li>
            ))}
          </ul>
        )}
      {free.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <select aria-label="Membro" value={user} onChange={(e) => setUser(e.target.value)} className={selectCls}>
            <option value="">Escolha um membro…</option>
            {free.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select>
          <select aria-label="Função" value={role} onChange={(e) => setRole(e.target.value as "coanfitriao" | "moderador")} className={selectCls}>
            <option value="moderador">Moderador</option>
            <option value="coanfitriao">Coanfitrião</option>
          </select>
          <Button onClick={() => void add()} disabled={busy}>Indicar</Button>
        </div>
      )}
    </div>
  );
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

/** Relatório de presença da reunião: quem era esperado, quem entrou, por quanto tempo; exporta em planilha (CSV). */
export function PresenceReport({ meetingId, title }: { meetingId: string; title: string }) {
  const [rows, setRows] = useState<PresenceRow[] | null>(null);
  useEffect(() => { let alive = true; void fetchPresence(meetingId).then((r) => { if (alive) setRows(r); }); return () => { alive = false; }; }, [meetingId]);
  const sum = presenceSummary(rows ?? []);
  const download = () => {
    const blob = new Blob([presenceCsv(rows ?? [])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `presenca-${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "reuniao"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="space-y-2 rounded-[14px] border border-border p-3" data-testid="video-presence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Presença</h3>
        <Button size="sm" variant="outline" onClick={download} disabled={!rows || rows.length === 0} data-testid="video-presence-csv"><Download className="mr-1.5 h-4 w-4" aria-hidden />Baixar planilha</Button>
      </div>
      {rows === null ? <p className="text-xs text-muted-foreground" role="status">Carregando…</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém registrado nesta reunião.</p>
        : (
          <>
            <p className="text-sm" data-testid="video-presence-summary"><strong>{sum.present}</strong> compareceram · <strong>{sum.absent}</strong> ausentes · {sum.expected} esperados · {sum.minutes.toLocaleString("pt-BR")} min no total</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead><tr className="border-b border-border text-muted-foreground"><th className="py-1.5 pr-2 font-medium">Nome</th><th className="pr-2 font-medium">Entrou</th><th className="pr-2 font-medium">Saiu</th><th className="pr-2 text-right font-medium">Min</th><th className="font-medium">Situação</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId} className="border-b border-border/60" data-testid="video-presence-row">
                      <td className="py-1.5 pr-2">{r.name}{r.role !== "participante" && <span className="text-muted-foreground"> · {ROLE_LABEL[r.role]}</span>}</td>
                      <td className="pr-2">{when(r.firstIn)}</td><td className="pr-2">{r.sessions > 0 && !r.lastOut ? "na sala" : when(r.lastOut)}</td>
                      <td className="pr-2 text-right">{r.minutes}</td>
                      <td>{r.removed ? "Retirado" : r.sessions > 0 ? (r.sessions > 1 ? `Compareceu (${r.sessions} entradas)` : "Compareceu") : r.expected ? "Ausente" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      <p className="text-xs text-muted-foreground">Os registros de presença ficam guardados por 12 meses e depois são apagados.</p>
    </div>
  );
}
