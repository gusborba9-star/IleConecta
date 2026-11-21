/** Classes dos avisos (literais, para o Tailwind não descartar): a cor da faixa lateral vem de --toast-accent, definida por tipo. */
export const TOAST_CLASSES = {
  toast:
    "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card py-3.5 pl-5 pr-11 text-foreground shadow-altar before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-[var(--toast-accent)] before:content-['']",
  title: "font-display text-[15px] font-bold leading-snug break-words",
  description: "mt-0.5 text-sm leading-snug text-muted-foreground break-words",
  icon: "!m-0 !h-9 !w-9 shrink-0",
  content: "min-w-0 flex-1",
  closeButton: "ic-toast-close",
  actionButton: "ml-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground",
  cancelButton: "ml-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground",
  success: "[--toast-accent:hsl(var(--forest))]",
  error: "[--toast-accent:hsl(var(--destructive))]",
  warning: "[--toast-accent:hsl(var(--gold))]",
  info: "[--toast-accent:hsl(var(--muted-foreground))]",
  default: "[--toast-accent:hsl(var(--gold))]",
} as const;
