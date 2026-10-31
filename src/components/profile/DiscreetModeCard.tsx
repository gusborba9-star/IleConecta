import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchDiscreet, saveDiscreet } from "@/lib/discreet";
import { cn } from "@/lib/utils";

/** Modo discreto: o aviso no celular chega sem o nome do app, da casa ou do assunto. Vale para clientes e casas. */
export default function DiscreetModeCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const uid = currentUser?.id;
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isRemoteAuth || !uid) return;
    let alive = true;
    void fetchDiscreet(uid).then((v) => {
      if (!alive) return;
      setOn(v);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid]);

  if (!isRemoteAuth || !uid || !loaded) return null;

  const toggle = async () => {
    if (saving) return;
    const next = !on;
    setSaving(true);
    setOn(next);
    const ok = await saveDiscreet(uid, next);
    setSaving(false);
    if (!ok) {
      setOn(!next);
      return void toast.error("Não foi possível salvar. Tente novamente.");
    }
    toast.success(next ? "Modo discreto ligado." : "Modo discreto desligado.");
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start gap-3">
        <EyeOff className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg">Modo discreto</h2>
          <p className="text-sm text-muted-foreground mt-1">
            No modo discreto, suas notificações chegam no celular apenas como “Nova notificação — Você tem uma novidade”, sem o nome do Ilê Conecta, da casa ou do assunto. Dentro do app você vê tudo normalmente.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Modo discreto"
          disabled={saving}
          onClick={() => void toggle()}
          className={cn("relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-60", on ? "bg-primary border-primary" : "bg-muted border-border")}
        >
          <span className={cn("absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5" : "translate-x-0")} style={{ height: 22, width: 22 }} />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Vale só para os avisos no celular. Para recebê-los, ative os avisos neste aparelho no sino de notificações.</p>
    </Card>
  );
}
