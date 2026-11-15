import { Link } from "react-router-dom";
import { MapPin, Star, CheckCircle2 } from "lucide-react";
import { Avatar, Badge, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import type { HouseUser } from "@/types";
import type { VisiblePromo } from "@/lib/promotions";
import PromoTrack from "@/components/promo/PromoTrack";
import BoostedServices from "@/components/promo/BoostedServices";

/** Tela inicial: casas em destaque na região de quem olha (até 3, já sorteadas) e serviços impulsionados. Só aparece se houver algo no ar. */
export default function FeedPromos({ owners, idByOwner, boosted }: { owners: string[]; idByOwner: Map<string, string>; boosted: VisiblePromo[] }) {
  const { users } = useApp();
  const houses = owners
    .map((id) => users.find((u): u is HouseUser => u.type === "commercial" && u.id === id))
    .filter((h): h is HouseUser => Boolean(h))
    .slice(0, 3);
  if (houses.length === 0 && !boosted.some((p) => p.itemType === "service")) return null;
  return (
    <div className="space-y-4">
      {houses.length > 0 && (
        <section aria-label="Casas em destaque">
          <div className="mb-2 flex items-center gap-2">
            <Star className="h-4 w-4 text-gold" aria-hidden />
            <h2 className="font-display font-bold text-lg">Casas em destaque</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {houses.map((h) => (
              <PromoTrack key={h.id} promoId={idByOwner.get(h.id)}>
                <Link to={`/casa/${h.id}`} className="block">
                  <Card className="lift flex items-center gap-3 p-3">
                    <Avatar src={h.avatar} name={h.name} size={52} ring="gold" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{h.name}</span>
                        {h.verified && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-label="Casa verificada" />}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{[h.city, h.state].filter(Boolean).join(", ") || "Local não informado"}</span>
                      </div>
                      <Badge tone="gold" className="mt-1"><Star className="h-3 w-3" aria-hidden /> Em destaque</Badge>
                    </div>
                  </Card>
                </Link>
              </PromoTrack>
            ))}
          </div>
        </section>
      )}
      <BoostedServices boosted={boosted} />
    </div>
  );
}
