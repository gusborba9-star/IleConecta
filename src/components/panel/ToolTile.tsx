import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolTone = "verde" | "terra" | "ouro" | "noite";

interface Props {
  icon: LucideIcon;
  label: string;
  tone: ToolTone;
  /** Destino (link). Sem `to`, vira botão e usa `onClick`. */
  to?: string;
  onClick?: () => void;
  /** Número de pendências (bolinha vermelha). */
  badge?: number;
  /** Texto curto abaixo do nome, ex.: o plano que inclui a ferramenta. */
  note?: string;
}

/** Atalho do painel: ícone com anel colorido e nome embaixo. Mesmo componente no Início, em Crescer e onde mais houver atalhos. */
export default function ToolTile({ icon: Icon, label, tone, to, onClick, badge, note }: Props) {
  const aria = [label, badge && badge > 0 ? `${badge} pendente${badge > 1 ? "s" : ""}` : "", note ?? ""].filter(Boolean).join(", ");
  const body = (
    <>
      <span className={cn("tool-ring relative", `tone-${tone}`)}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
        {badge && badge > 0 ? (
          <span aria-hidden className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[hsl(var(--danger))] px-1 text-[11px] font-bold text-white shadow-sm">{badge > 9 ? "9+" : badge}</span>
        ) : null}
      </span>
      <span className="mt-2 block max-w-full break-words text-center text-[12px] font-semibold leading-tight text-foreground">{label}</span>
      {note && <span className="mt-0.5 block max-w-full break-words text-center text-[10.5px] leading-tight text-muted-foreground">{note}</span>}
    </>
  );
  const cls = "tool-tile group flex min-w-0 flex-col items-center rounded-2xl px-1 pb-2 pt-2 outline-none transition focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  return to ? (
    <Link to={to} aria-label={aria} className={cls}>{body}</Link>
  ) : (
    <button type="button" aria-label={aria} onClick={onClick} className={cls}>{body}</button>
  );
}
