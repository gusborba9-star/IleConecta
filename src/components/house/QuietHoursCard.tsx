import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { DEFAULT_QUIET, fetchQuietPrefs, saveQuietPrefs, type QuietPrefs } from "@/lib/houseReport";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** "Não perturbe": no horário escolhido o celular não toca; o aviso continua no sino. */
export default function QuietHoursCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const uid = currentUser?.id;
  const [prefs, setPrefs] = useState<QuietPrefs>(DEFAULT_QUIET);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    let alive = true;
    void fetchQuietPrefs(uid).then((p) => {
      if (!alive) return;
      setPrefs(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid]);

  if (!isRemoteAuth || !uid || !loaded) return null;

  const save = async (next: QuietPrefs) => {
    const prev = prefs;
    setPrefs(next);
    setSaving(true);
    const ok = await saveQuietPrefs(uid, next);
    setSaving(false);
    if (!ok) {
      setPrefs(prev);
      toast.error("Não foi possível salvar. Tente novamente.");
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2"><Moon className="h-4 w-4 text-primary" /><h2 className="font-display font-bold text-lg">Não perturbe</h2></div>
      <p className="text-sm text-muted-foreground">
        Nos horários escolhidos o celular não toca. Os avisos continuam no sino, e só um assunto que a assistente passou para você ("precisa de você") ainda chama a atenção.
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" disabled={saving} checked={prefs.on} onChange={(e) => void save({ ...prefs, on: e.target.checked })} />
        Ativar Não perturbe
      </label>
      <div className={`flex flex-wrap items-center gap-2 text-sm ${prefs.on ? "" : "opacity-50"}`}>
        <span>Das</span>
        <select aria-label="Início" disabled={!prefs.on || saving} className="h-10 rounded-md border border-input bg-background px-2" value={prefs.start} onChange={(e) => void save({ ...prefs, start: Number(e.target.value) })}>
          {HOURS.map((h) => <option key={h} value={h}>{h}h</option>)}
        </select>
        <span>às</span>
        <select aria-label="Fim" disabled={!prefs.on || saving} className="h-10 rounded-md border border-input bg-background px-2" value={prefs.end} onChange={(e) => void save({ ...prefs, end: Number(e.target.value) })}>
          {HOURS.map((h) => <option key={h} value={h}>{h}h</option>)}
        </select>
        <span className="text-xs text-muted-foreground">(horário de Brasília)</span>
      </div>
      {prefs.on && prefs.start === prefs.end && <p className="text-xs text-muted-foreground">Início e fim iguais: o Não perturbe não faz efeito.</p>}
    </Card>
  );
}
