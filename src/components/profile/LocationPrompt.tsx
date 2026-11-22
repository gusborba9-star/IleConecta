import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/base";
import StateSelect from "@/components/profile/StateSelect";
import { useApp } from "@/contexts/AppContext";
import { cleanCity, shouldShowLocationPrompt } from "@/lib/locationPromptCore.js";

const key = (uid: string) => `ic.loc.dismissed.${uid}`;
const readDismissed = (uid: string): number | null => {
  try { const v = Number(localStorage.getItem(key(uid))); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
};

/**
 * Pergunta a cidade e o estado do cliente, sem obrigar: "Agora não" some por 3 dias (context "home") e a pergunta volta sozinha
 * quando a pessoa toca em algo que depende da cidade (context "inline", sem intervalo). Nunca bloqueia navegação, reserva ou pagamento.
 */
export default function LocationPrompt({ context = "home" }: { context?: "home" | "inline" }) {
  const { currentUser, users, updateUser } = useApp();
  const uid = currentUser?.id ?? "";
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => (uid ? readDismissed(uid) : null));
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const cities = useMemo(() => [...new Set(users.filter((u) => u.type === "commercial").map((u) => (u.city ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [users]);

  if (!currentUser || currentUser.type === "commercial") return null;
  if (!shouldShowLocationPrompt({ user: currentUser, dismissedAt, context })) return null;

  const save = async () => {
    const c = cleanCity(city);
    if (!c || !state) return toast.error("Informe a cidade e o estado.");
    setBusy(true);
    const ok = await updateUser({ city: c, state });
    setBusy(false);
    if (!ok) return toast.error("Não foi possível salvar agora. Tente novamente.");
    toast.success("Pronto. Vamos mostrar o que há na sua cidade.");
  };
  const later = () => {
    const now = Date.now();
    try { localStorage.setItem(key(uid), String(now)); } catch { /* sem armazenamento: some só nesta visita */ }
    setDismissedAt(now);
  };

  return (
    <Card className="p-4" role="region" aria-label="Sua cidade">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden><MapPin className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Em qual cidade você está?</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Para mostrar o que acontece na sua cidade. Você pode mudar quando quiser.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem]">
            <Input aria-label="Cidade" list="ic-cidades" placeholder="Cidade" value={city} maxLength={80} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} />
            <datalist id="ic-cidades">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            <StateSelect value={state} onChange={setState} className="h-11" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
            {context === "home" && <button type="button" onClick={later} className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Agora não</button>}
          </div>
        </div>
      </div>
    </Card>
  );
}
