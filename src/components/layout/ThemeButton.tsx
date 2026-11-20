import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/base";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";

const NEXT: Record<ThemePref, ThemePref> = { claro: "escuro", escuro: "auto", auto: "claro" };
const NAME: Record<ThemePref, string> = { claro: "claro", escuro: "escuro", auto: "automático" };
const ICON = { claro: Sun, escuro: Moon, auto: Monitor } as const;

/** Aparência a um toque, no topo: claro → escuro → automático. A escolha vale só neste aparelho. */
export default function ThemeButton() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const Icon = ICON[pref];
  return (
    <Button variant="ghost" size="icon" aria-label={`Aparência: ${NAME[pref]}. Tocar para ${NAME[NEXT[pref]]}.`} title={`Aparência: ${NAME[pref]}`} onClick={() => { const n = NEXT[pref]; setPref(n); setThemePref(n); }}>
      <Icon className="h-5 w-5" aria-hidden />
    </Button>
  );
}
