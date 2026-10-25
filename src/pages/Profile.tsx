import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { formatBRL, timeAgo } from "@/lib/utils";
import { Sparkles, Ticket, Heart } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function Profile() {
  const { currentUser, purchases, rituals, getHouse, posts } = useApp();
  const nav = useNavigate();
  if (!currentUser) return null;

  const myPurchases = purchases.filter((p) => p.userId === currentUser.id);
  const myPosts = posts.filter((p) => p.houseId === currentUser.id);

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar src={currentUser.avatar} name={currentUser.name} size={80} />
          <div className="flex-1">
            <h1 className="font-display font-bold text-2xl">{currentUser.name}</h1>
            <div className="text-sm text-muted-foreground">Cliente · {currentUser.city}, {currentUser.state}</div>
            <div className="flex gap-1.5 mt-2">
              {(currentUser as any).interests?.map((i: string) => (
                <Badge key={i} tone="muted">{i}</Badge>
              ))}
            </div>
          </div>
          <Button variant="outline">Editar perfil</Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Minhas contratações</h2>
        </div>
        {myPurchases.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Você ainda não contratou nenhum ritual.{" "}
            <Link to="/rituais" className="text-primary font-semibold hover:underline">Descubra rituais →</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {myPurchases.map((p) => {
              const r = rituals.find((x) => x.id === p.ritualId)!;
              const h = getHouse(r.houseId);
              return (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <img src={r.cover} className="h-14 w-14 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{h?.name} · {timeAgo(p.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold">{formatBRL(p.amount)}</div>
                    <Button variant="ghost" size="sm" onClick={() => nav(`/mensagens/${h?.id}`)}>Falar com a casa</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-gold" />
          <h2 className="font-display font-bold text-lg">Recomendado para você</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rituals.slice(0, 4).map((r) => (
            <Link key={r.id} to={`/rituais/${r.id}`} className="flex gap-3 p-3 rounded-xl border border-border hover:shadow-card transition">
              <img src={r.cover} className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0">
                <div className="font-semibold text-sm line-clamp-2">{r.title}</div>
                <div className="text-xs text-muted-foreground">{formatBRL(r.price)} · {r.vagasTotal - r.vagasVendidas} vagas</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {myPosts.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-5 w-5 text-primary" />
            <h2 className="font-display font-bold text-lg">Suas publicações</h2>
          </div>
          <div className="space-y-2">
            {myPosts.map((p) => (
              <div key={p.id} className="p-3 border border-border rounded-xl text-sm">
                <div className="text-xs text-muted-foreground">{timeAgo(p.createdAt)}</div>
                <div>{p.content}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
