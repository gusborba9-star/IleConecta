import { Link } from "react-router-dom";
import { Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Crescer": Impulsionar e Destaques são a mesma família (alcance pago) e ficam lado a lado. Cada aba é uma rota própria, então os links de retorno do pagamento continuam valendo. */
export default function GrowTabs({ active }: { active: "impulsionar" | "destaques" }) {
  const items = [
    { id: "impulsionar", to: "/impulsionar", label: "Impulsionar", hint: "publicação, serviço ou ritual", icon: TrendingUp },
    { id: "destaques", to: "/destaques", label: "Destaques nos feeds", hint: "a casa em evidência na região", icon: Star },
  ] as const;
  return (
    <nav aria-label="Alcance pago: impulsionar e destaques" className="grid grid-cols-2 gap-2">
      {items.map((it) => {
        const on = it.id === active;
        return (
          <Link
            key={it.id}
            to={it.to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2 text-left shadow-card outline-none transition focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              on ? "border-gold bg-gradient-to-br from-gold/25 to-card" : "border-gold/35 bg-card hover:bg-muted"
            )}
          >
            <span className={cn("tool-ring tone-ouro !h-9 !w-9 shrink-0 !shadow-[0_0_0_2px_hsl(var(--tc))]")}><it.icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold leading-tight">{it.label}</span>
              <span className="block break-words text-[11px] leading-tight text-muted-foreground">{it.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
