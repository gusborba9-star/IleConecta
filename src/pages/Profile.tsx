import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { formatBRL, timeAgo } from "@/lib/utils";
import { Sparkles, Ticket, Heart, MapPin, Pencil } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import EditProfileModal from "@/components/profile/EditProfileModal";
import AssistantSettings from "@/components/assistant/AssistantSettings";
import ThemeSwitch from "@/components/profile/ThemeSwitch";

export default function Profile() {
  const { currentUser, purchases, rituals, getHouse, posts } = useApp();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  if (!currentUser) return null;

  const myPurchases = purchases.filter((p) => p.userId === currentUser.id);
  const myPosts = posts.filter((p) => p.houseId === currentUser.id);

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="overflow-hidden">
        <div className="h-24 sm:h-28 bg-gradient-to-br from-[#14543F] to-[#0A2E22] border-b-2 border-gold/60" aria-hidden />
        <div className="px-5 sm:px-6 pb-6">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="rounded-full p-1.5 bg-card shadow-card">
              <Avatar src={currentUser.avatar} name={currentUser.name} size={88} className="ring-2 ring-gold" />
            </div>
            <Button variant="outline" size="sm" className="mb-1 shrink-0" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar perfil
            </Button>
          </div>
          <h1 className="mt-3 font-display font-bold text-2xl sm:text-3xl leading-tight break-words">{currentUser.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge tone="forest">{currentUser.type === "commercial" ? "Casa espiritual" : "Cliente"}</Badge>
            {(currentUser.city || currentUser.state) && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[currentUser.city, currentUser.state].filter(Boolean).join(", ")}</span>
            )}
          </div>
          {currentUser.type === "personal" && currentUser.interests && currentUser.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {currentUser.interests.map((i) => (
                <Badge key={i} tone="muted">{i}</Badge>
              ))}
            </div>
          )}
          {currentUser.bio && <p className="mt-4 text-sm text-muted-foreground">{currentUser.bio}</p>}
        </div>
      </Card>
      <EditProfileModal open={editing} onClose={() => setEditing(false)} />
      <AssistantSettings />
      <ThemeSwitch />

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Reservas demonstrativas</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Registros locais de simulação. Não representam pagamento ou reserva real.</p>
        {myPurchases.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Você ainda não criou uma simulação de reserva.{" "}
            <Link to="/rituais" className="text-primary font-semibold hover:underline">Descubra rituais →</Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {myPurchases.map((p) => {
              const r = rituals.find((x) => x.id === p.ritualId);
              if (!r) {
                return (
                  <div key={p.id} className="py-3 flex items-center gap-3">
                    <div className="h-14 w-14 rounded-lg bg-muted grid place-items-center text-xs text-muted-foreground">N/D</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">Ritual não encontrado</div>
                      <div className="text-xs text-muted-foreground">Registro demonstrativo antigo · {timeAgo(p.createdAt)}</div>
                    </div>
                    <div className="font-display font-bold">{formatBRL(p.amount)}</div>
                  </div>
                );
              }
              const h = getHouse(r.houseId);
              return (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <img src={r.cover} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{h?.name ?? "Casa não encontrada"} · {timeAgo(p.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold">{formatBRL(p.amount)}</div>
                    {h && <Button variant="ghost" size="sm" onClick={() => nav(`/mensagens/${h.id}`)}>Falar com a casa</Button>}
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
