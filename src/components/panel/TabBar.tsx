import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface TabItem { id: string; label: string; badge?: number }

interface Props {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** Prefixo dos ids (liga cada aba ao seu painel: `${idBase}-tab-x` e `${idBase}-painel-x`). */
  idBase: string;
}

/** Abas com teclado (setas, Home, End) e leitor de tela. O painel de cada aba usa `tabPanelProps`. */
export default function TabBar({ tabs, value, onChange, label, idBase }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[j].id);
    refs.current[tabs[j].id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="scroll-x -mx-1 flex gap-2 px-1 py-1">
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            id={`${idBase}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idBase}-painel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-card outline-none transition focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              on ? "border-forest bg-gradient-to-br from-[#14543F] to-[#0F3B2D] text-white" : "border-gold/35 bg-card text-foreground hover:bg-muted"
            )}
          >
            {t.label}
            {t.badge ? <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold", on ? "bg-gold text-gold-foreground" : "bg-gold/25 text-gold-ink")}>{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
