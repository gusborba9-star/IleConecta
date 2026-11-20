import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "ic:secao:";
const read = (id: string, fallback: boolean) => {
  try { const v = window.localStorage.getItem(KEY + id); return v === null ? fallback : v === "1"; } catch { return fallback; }
};
const write = (id: string, open: boolean) => {
  try { window.localStorage.setItem(KEY + id, open ? "1" : "0"); } catch { /* sem armazenamento: só não lembra */ }
};

interface Props {
  /** Identifica a seção para lembrar aberta/fechada neste aparelho. */
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  /** Abre a seção quando algo de fora pede (ex.: link com foco). */
  forceOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/** Seção recolhível: o conteúdo só é montado quando aberta (não faz consulta ao banco enquanto estiver fechada). */
export default function Collapse({ id, title, hint, defaultOpen = false, forceOpen = false, children, className }: Props) {
  const [open, setOpen] = useState(() => forceOpen || read(id, defaultOpen));
  const panel = useId();
  const shown = open || forceOpen;
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={panel}
          onClick={() => { const n = !shown; setOpen(n); write(id, n); }}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[20px] border border-gold/35 bg-card px-4 py-3 text-left shadow-card outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          <span className="min-w-0 break-words font-semibold">{title}{hint && <span className="font-normal text-muted-foreground"> · {hint}</span>}</span>
          <ChevronDown aria-hidden className={cn("h-5 w-5 shrink-0 transition-transform", shown && "rotate-180")} />
        </button>
      </h2>
      <div id={panel} hidden={!shown} className="space-y-3">{shown ? children : null}</div>
    </section>
  );
}
