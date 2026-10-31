import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estrelas só de leitura. */
export function Stars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? "text-gold fill-gold" : "text-muted-foreground/40"} />
      ))}
    </span>
  );
}

/** Escolha de 1 a 5 estrelas. */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Sua nota">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} ${i === 1 ? "estrela" : "estrelas"}`} onClick={() => onChange(i)} className="p-1">
          <Star className={cn("h-8 w-8 transition", i <= value ? "text-gold fill-gold" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}
