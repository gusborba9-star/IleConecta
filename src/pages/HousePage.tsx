import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { CheckCircle2, MapPin, MessageCircle, Star, TrendingUp, UserPlus } from "lucide-react";
import PostCard from "@/components/feed/PostCard";
import RitualCard from "@/components/feed/RitualCard";
import { cn } from "@/lib/utils";

export default function HousePage() {
  const { id } = useParams();
  const { getHouse, posts, rituals, currentUser } = useApp();
  const house = getHouse(id!);
  const nav = useNavigate();
  const [tab, setTab] = useState<"feed" | "rituais" | "sobre">("feed");

  if (!house)
    return (
      <div className="p-8 text-center">
        <div className="font-display text-2xl">Casa não encontrada</div>
        <Button className="mt-4" onClick={() => nav("/")}>Voltar ao feed</Button>
      </div>
    );

  const housePosts = useMemo(() => posts.filter((p) => p.houseId === house.id), [posts, house.id]);
  const houseRituals = useMemo(() => rituals.filter((r) => r.houseId === house.id), [rituals, house.id]);
  const isOwn = currentUser?.id === house.id;

  return (
    <div className="pb-16 lg:pb-4">
      <Card className="overflow-hidden">
        <div className="relative h-56 md:h-72 bg-muted">
          <img src={house.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {house.boost && (
            <Badge tone="gold" className="absolute top-4 right-4 shadow-card">
              <TrendingUp className="h-3 w-3" /> Impulsionada · {house.boost.level}
            </Badge>
          )}
        </div>
        <div className="px-6 pb-6">
          <div className="flex flex-wrap items-end gap-4 -mt-12">
            <Avatar src={house.avatar} name={house.name} size={112} ring="gold" />
            <div className="flex-1 min-w-0 pt-14">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display font-bold text-2xl md:text-3xl">{house.name}</h1>
                {house.verified && <Badge tone="primary"><CheckCircle2 className="h-3 w-3" /> Verificada</Badge>}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {house.city}, {house.state}</span>
                <span>·</span>
                <span>{house.category}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Star className="h-3 w-3 text-gold fill-gold" /> {house.rating.toFixed(1)} · {house.followers.toLocaleString("pt-BR")} seguidores</span>
              </div>
            </div>
            <div className="flex gap-2 pt-14">
              {isOwn ? (
                <Button onClick={() => nav("/impulsionar")}><TrendingUp className="h-4 w-4" /> Impulsionar</Button>
              ) : (
                <>
                  <Button variant="outline"><UserPlus className="h-4 w-4" /> Seguir</Button>
                  <Button onClick={() => nav(`/mensagens/${house.id}`)}><MessageCircle className="h-4 w-4" /> Chat</Button>
                </>
              )}
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-3xl">{house.bio}</p>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {house.tags.map((t) => (
              <Badge key={t} tone="muted">{t}</Badge>
            ))}
          </div>

          <div className="mt-6 flex gap-1 border-b border-border">
            {(["feed", "rituais", "sobre"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-3 text-sm font-semibold capitalize transition -mb-px",
                  tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "feed" ? "Publicações" : t}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-4">
        {tab === "feed" && housePosts.map((p) => <PostCard key={p.id} post={p} />)}
        {tab === "feed" && housePosts.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Ainda não há publicações desta casa.</Card>
        )}
        {tab === "rituais" && houseRituals.map((r) => <RitualCard key={r.id} ritual={r} />)}
        {tab === "rituais" && houseRituals.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Esta casa ainda não publicou rituais.</Card>
        )}
        {tab === "sobre" && (
          <Card className="p-6 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Sobre a casa</div>
              <p className="mt-2">{house.bio}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Categoria" value={house.category} />
              <Stat label="Localização" value={`${house.city} · ${house.state}`} />
              <Stat label="Seguidores" value={house.followers.toLocaleString("pt-BR")} />
              <Stat label="Avaliação" value={`${house.rating.toFixed(1)} ★`} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl bg-muted/50 border border-border">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-lg mt-1">{value}</div>
    </div>
  );
}
