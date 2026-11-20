import { cn } from "@/lib/utils";

/** Bolinha de pendências do menu. Escondida do leitor de tela: o número vai no texto do item (`NavBadgeText`). */
export function NavBadge({ n, className }: { n: number; className?: string }) {
  if (!n || n <= 0) return null;
  return <span aria-hidden className={cn("ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[hsl(var(--danger))] px-1.5 text-[11px] font-bold text-white", className)}>{n > 9 ? "9+" : n}</span>;
}

/** Texto só para leitor de tela: "(2 pendentes)". */
export function NavBadgeText({ n }: { n: number }) {
  return n > 0 ? <span className="sr-only"> ({n} pendente{n > 1 ? "s" : ""})</span> : null;
}
