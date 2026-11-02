import React from "react";
import { cn, initials } from "@/lib/utils";

// ---------- Button ----------
type BtnVariant = "primary" | "secondary" | "ghost" | "gold" | "outline" | "danger";
type BtnSize = "sm" | "md" | "lg" | "icon";

const variantClass: Record<BtnVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 shadow-cta active:translate-y-px",
  gold: "bg-gold text-gold-foreground hover:brightness-105 shadow-card active:translate-y-px",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "bg-transparent hover:bg-muted text-foreground",
  outline: "bg-card border border-border/80 hover:bg-muted text-foreground shadow-[0_0_0_1px_hsl(22_30%_20%/0.04)]",
  danger: "bg-[hsl(var(--danger))] text-white hover:brightness-110",
};
const sizeClass: Record<BtnSize, string> = {
  sm: "h-9 px-3.5 text-sm rounded-xl",
  md: "h-11 px-5 text-sm rounded-[14px]",
  lg: "h-12 px-6 text-base rounded-[14px]",
  icon: "h-10 w-10 rounded-full",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }
>(({ className, variant = "primary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 disabled:pointer-events-none",
      variantClass[variant],
      sizeClass[size],
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";

// ---------- Card ----------
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("bg-card text-card-foreground rounded-2xl shadow-card border border-border/60", className)} {...props} />
);

// ---------- Input ----------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full h-11 px-4 rounded-[14px] bg-card border border-input placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent transition",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full min-h-[96px] px-4 py-3 rounded-[14px] bg-card border border-input placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] transition",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// ---------- Label ----------
export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={cn("text-sm font-medium text-foreground/80 mb-1.5 block", className)} {...props} />
);

// ---------- Avatar ----------
export const Avatar: React.FC<{
  src?: string;
  name?: string;
  size?: number;
  ring?: "gold" | "primary" | "none";
  className?: string;
}> = ({ src, name = "?", size = 40, ring = "none", className }) => {
  const ringClass = ring === "gold" ? "ring-2 ring-gold ring-offset-2 ring-offset-background" : ring === "primary" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-full bg-muted text-foreground/70 font-semibold select-none shrink-0",
        ringClass,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : <span>{initials(name)}</span>}
    </div>
  );
};

// ---------- Badge ----------
export const Badge: React.FC<
  React.HTMLAttributes<HTMLSpanElement> & { tone?: "gold" | "primary" | "muted" | "forest" | "danger" | "plum" }
> = ({ className, tone = "muted", ...props }) => {
  const tones: Record<string, string> = {
    gold: "bg-gold/20 text-gold-ink border border-gold/30",
    primary: "bg-primary/12 text-primary border border-primary/30",
    forest: "bg-forest/12 text-forest border border-forest/30",
    plum: "bg-plum/12 text-plum border border-plum/30",
    muted: "bg-muted text-muted-foreground border border-border",
    danger: "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] border border-[hsl(var(--danger)/0.3)]",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
};

// ---------- Modal ----------
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ open, onClose, title, children, maxWidth = "max-w-lg" }) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  const titleId = React.useId();
  closeRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const getFocusable = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => element.getAttribute("aria-hidden") !== "true");

    getFocusable()[0]?.focus();
    if (getFocusable().length === 0) dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Janela de diálogo"}
        tabIndex={-1}
        className={cn("relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto bg-card rounded-2xl shadow-altar border border-border animate-fade-in", maxWidth)}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 id={titleId} className="text-lg font-display font-bold">{title}</h3>
            <button type="button" aria-label="Fechar modal" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">✕</button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

// ---------- Progress ----------
export const Progress: React.FC<{ value: number; className?: string; tone?: "primary" | "gold" | "forest" }> = ({
  value,
  className,
  tone = "primary",
}) => {
  const bg = tone === "gold" ? "bg-gold" : tone === "forest" ? "bg-forest" : "bg-primary";
  return (
    <div className={cn("w-full h-2 rounded-full bg-muted overflow-hidden", className)}>
      <div className={cn("h-full transition-all", bg)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
};
