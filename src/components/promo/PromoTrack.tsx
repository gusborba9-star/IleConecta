import { useEffect, useRef, type ReactNode } from "react";
import { markPromo } from "@/lib/promoTrack";

/** Envolve um item promovido: conta "viu" quando metade dele aparece na tela e "abriu" quando a pessoa clica. Sem código da compra, não faz nada. */
export default function PromoTrack({ promoId, children, className }: { promoId?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!promoId || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { markPromo(promoId, "view"); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [promoId]);
  return <div ref={ref} className={className} onClickCapture={promoId ? () => markPromo(promoId, "open") : undefined}>{children}</div>;
}
