import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, X } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import { fetchReviewable, type Reviewable } from "@/lib/reviews";

const KEY = "ile:reviews-dismissed";
const RECENT_DAYS = 14;
const readDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const keyOf = (i: Reviewable) => `${i.kind}-${i.ref}`;

/** Convite na tela do cliente: compras concluídas que ainda não foram avaliadas (some quando o recurso está desligado). */
export default function PendingReviewsCard() {
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const uid = currentUser?.id;
  const isClient = currentUser?.type === "personal";
  const [items, setItems] = useState<Reviewable[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    if (!isRemoteAuth || !uid || !isClient) return;
    let alive = true;
    void fetchReviewable().then((x) => alive && setItems(x));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, uid, isClient]);

  const recent = Date.now() - RECENT_DAYS * 86_400_000;
  const shown = items.filter((i) => !dismissed.includes(keyOf(i)) && new Date(i.doneAt).getTime() > recent);
  if (shown.length === 0) return null;
  const close = () => {
    const next = Array.from(new Set([...dismissed, ...shown.map(keyOf)])).slice(-200);
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
  };
  return (
    <Card className="p-5 space-y-3 border-gold/50">
      <div className="flex items-center gap-2"><Star className="h-4 w-4 text-gold fill-gold" /><h2 className="font-display font-bold text-lg flex-1">Conte como foi</h2><button type="button" aria-label="Fechar e não lembrar mais" onClick={close} className="p-1 -m-1 rounded-full text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></div>
      <ul className="divide-y divide-border">
        {shown.slice(0, 3).map((i) => (
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
