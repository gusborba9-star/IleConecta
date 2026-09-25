import React from "react";
import { cn, initials } from "@/lib/utils";

// ---------- Button ----------
type BtnVariant = "primary" | "secondary" | "ghost" | "gold" | "outline" | "danger";
type BtnSize = "sm" | "md" | "lg" | "icon";

const variantClass: Record<BtnVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 shadow-card",
  gold: "bg-gold text-gold-foreground hover:brightness-105 shadow-card",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "bg-transparent hover:bg-muted text-foreground",
  outline: "bg-transparent border border-border hover:bg-muted text-foreground",
  danger: "bg-[hsl(var(--danger))] text-white hover:brightness-110",
};
const sizeClass: Record<BtnSize, string> = {
  sm: "h-9 px-3 text-sm rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-12 px-6 text-base rounded-full",
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
        "w-full h-11 px-4 rounded-xl bg-background border border-input placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent transition",
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
        "w-full min-h-[96px] px-4 py-3 rounded-xl bg-background border border-input placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] transition",
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
  React.HTMLAttributes<HTMLSpanElement> & { tone?: "gold" | "primary" | "muted" | "forest" | "danger" }
> = ({ className, tone = "muted", ...props }) => {
  const tones: Record<string, string> = {
    gold: "bg-gold/20 text-[hsl(30,60%,25%)] border border-gold/30",
    primary: "bg-primary/12 text-primary border border-primary/30",
    forest: "bg-forest/12 text-forest border border-forest/30",
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cn("relative w-full bg-card rounded-2xl shadow-altar border border-border animate-fade-in", maxWidth)}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-lg font-display font-bold">{title}</h3>
            <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground grid place-items-center">✕</button>
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
