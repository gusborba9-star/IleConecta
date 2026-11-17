import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchSocialPrefs, saveSocialPref, SOCIAL_DEFAULT, type SocialKey, type SocialPrefs } from "@/lib/socialPrefs";
import { cn } from "@/lib/utils";

const ROWS: { key: SocialKey; label: string; hint: string }[] = [
  { key: "notify_comments", label: "Comentários", hint: "Quando alguém comenta numa publicação sua." },
  { key: "notify_likes", label: "Curtidas", hint: "Várias curtidas na mesma publicação viram um aviso só." },
  { key: "notify_follows", label: "Novos seguidores", hint: "Quando alguém passa a seguir a sua casa." },
];

/** A casa escolhe quais interações tocam o sino (e o celular, se ativado). Só casas. */
export default function SocialNoticesCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const uid = currentUser?.id;
  const isHouse = currentUser?.type === "commercial";
  const [prefs, setPrefs] = useState<SocialPrefs>(SOCIAL_DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<SocialKey | null>(null);

  useEffect(() => {
    if (!isRemoteAuth || !uid || !isHouse) return;
    let alive = true;
    void fetchSocialPrefs(uid).then((p) => {
      if (!alive) return;
      setPrefs(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid, isHouse]);

  if (!isRemoteAuth || !uid || !isHouse || !loaded) return null;

  const toggle = async (key: SocialKey) => {
    if (busy) return;
    const next = !prefs[key];
    setBusy(key);
    setPrefs((p) => ({ ...p, [key]: next }));
    const ok = await saveSocialPref(uid, key, next);
    setBusy(null);
    if (!ok) {
      setPrefs((p) => ({ ...p, [key]: !next }));
      return void toast.error("Não foi possível salvar. Tente novamente.");
    }
    toast.success(next ? "Aviso ligado." : "Aviso desligado.");
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Heart className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg">Avisos de movimento</h2>
          <p className="text-sm text-muted-foreground mt-1">Saiba na hora quando alguém comenta, curte ou passa a seguir a sua casa. Escolha o que quer receber.</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {ROWS.map((r) => (
          <li key={r.key} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.hint}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[r.key]}
              aria-label={r.label}
              disabled={busy === r.key}
              onClick={() => void toggle(r.key)}
              className={cn("relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-60", prefs[r.key] ? "bg-primary border-primary" : "bg-muted border-border")}
            >
              <span className={cn("absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform", prefs[r.key] ? "translate-x-5" : "translate-x-0")} style={{ height: 22, width: 22 }} />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Os avisos respeitam o “Não perturbe” e o modo discreto no celular.</p>
    </Card>
  );
}
