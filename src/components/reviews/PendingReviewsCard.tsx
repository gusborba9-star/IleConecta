import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchReviewable, type Reviewable } from "@/lib/reviews";

/** Convite na tela do cliente: compras concluídas que ainda não foram avaliadas (some quando o recurso está desligado). */
export default function PendingReviewsCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const uid = currentUser?.id;
  const isClient = currentUser?.type === "personal";
  const [items, setItems] = useState<Reviewable[]>([]);

  useEffect(() => {
    if (!isRemoteAuth || !uid || !isClient) return;
    let alive = true;
    void fetchReviewable().then((x) => alive && setItems(x));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid, isClient]);

  if (items.length === 0) return null;
  return (
    <Card className="p-5 space-y-3 border-gold/50">
      <div className="flex items-center gap-2"><Star className="h-4 w-4 text-gold fill-gold" /><h2 className="font-display font-bold text-lg">Conte como foi</h2></div>
      <ul className="divide-y divide-border">
        {items.slice(0, 3).map((i) => (
          <li key={`${i.kind}-${i.ref}`} className="flex flex-wrap items-center gap-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{i.houseName}</div>
              <div className="text-xs text-muted-foreground truncate">{i.kind === "ritual" ? "Ritual" : "Serviço"}: {i.title}</div>
            </div>
            <Button size="sm" onClick={() => nav(`/casa/${i.houseOwnerId}?aba=avaliacoes`)}>Avaliar</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
