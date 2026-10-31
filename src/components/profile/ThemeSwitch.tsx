import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Card } from "@/components/base";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "claro", label: "Claro", icon: Sun },
  { id: "escuro", label: "Escuro", icon: Moon },
  { id: "auto", label: "Automático", icon: Monitor },
];

/** Aparência do app. A escolha vale só neste aparelho. */
export default function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  return (
    <Card className="p-5">
      <h2 className="font-display font-bold text-lg">Aparência</h2>
      <p className="text-sm text-muted-foreground mt-1">Automático segue o ajuste do seu aparelho. A escolha vale só neste aparelho.</p>
      <div role="radiogroup" aria-label="Tema" className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={pref === id}
            onClick={() => { setPref(id); setThemePref(id); }}
            className={cn("flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium transition", pref === id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </Card>
  );
}
