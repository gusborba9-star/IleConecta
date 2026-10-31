import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { CheckCircle2, MapPin, MessageCircle, Pencil, Star, TrendingUp, UserCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchFollowSummary, setFollowing } from "@/lib/follows";
import EditProfileModal from "@/components/profile/EditProfileModal";
import PostCard from "@/components/feed/PostCard";
import RitualCard from "@/components/feed/RitualCard";
import { cn, isPromotionActive } from "@/lib/utils";
import { isRemoteId } from "@/lib/remoteData";
import AssistantChat from "@/components/assistant/AssistantChat";
import ServicesTab from "@/components/services/ServicesTab";
import RitualsTab from "@/components/rituals/RitualsTab";
import HouseRefundCases from "@/components/refunds/HouseRefundCases";
import ReviewsTab from "@/components/reviews/ReviewsTab";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { isFeatureOn } from "@/lib/platformConfig";

type Tab = "feed" | "servicos" | "rituais" | "avaliacoes" | "assistente" | "sobre";
const TAB_LABEL: Record<Tab, string> = { feed: "Publicações", servicos: "Serviços", rituais: "Rituais", avaliacoes: "Avaliações", assistente: "Assistente", sobre: "Sobre" };

export default function HousePage() {
  const { id } = useParams();
  const { getHouse, posts, rituals, currentUser, isRemoteAuth } = useApp();
  const { config } = usePlatformConfig();
  const house = getHouse(id ?? "");
  const nav = useNavigate();
  const [params] = useSearchParams();
  const startTab = params.get("aba");
  const [tab, setTab] = useState<Tab>(startTab === "servicos" ? "servicos" : startTab === "rituais" ? "rituais" : startTab === "avaliacoes" ? "avaliacoes" : "feed");
  const [editing, setEditing] = useState(params.get("editar") === "1" && currentUser?.id === id);
  const [following, setFollowingState] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followDelta, setFollowDelta] = useState(0);
  const realHouse = isRemoteAuth && isRemoteId(id ?? "");
  useEffect(() => {
    setFollowingState(false);
    setFollowDelta(0);
    if (!realHouse || !id) return;
    let alive = true;
    void fetchFollowSummary().then((s) => alive && setFollowingState(s.mine.includes(id)));
    return () => {
      alive = false;
    };
  }, [id, realHouse]);
  const toggleFollow = async () => {
    if (!id || followBusy) return;
    setFollowBusy(true);
    const next = !following;
    const error = await setFollowing(id, next);
    setFollowBusy(false);
    if (error) return void toast.error(error);
    setFollowingState(next);
    setFollowDelta((d) => d + (next ? 1 : -1));
    toast.success(next ? "Você agora segue esta casa." : "Você deixou de seguir esta casa.");
  };
  const housePosts = house ? posts.filter((p) => p.houseId === house.id) : [];
  const houseRituals = house ? rituals.filter((r) => r.houseId === house.id) : [];

  if (!house)
    return (
      <div className="p-8 text-center">
        <div className="font-display text-2xl">Casa não encontrada</div>
        <Button className="mt-4" onClick={() => nav("/")}>Voltar ao feed</Button>
      </div>
    );

  const followers = Math.max(0, house.followers + followDelta);
  const isOwn = currentUser?.id === house.id;
  const hasAssistant = isRemoteAuth && isRemoteId(house.id) && !isOwn && isFeatureOn(config, "assistant", house.id);
  const hasServices = isRemoteAuth && isRemoteId(house.id);
  const hasReviews = hasServices && isFeatureOn(config, "reviews", house.id);
  const tabs: Tab[] = ["feed", ...(hasServices ? (["servicos"] as Tab[]) : []), "rituais", ...(hasReviews ? (["avaliacoes"] as Tab[]) : []), ...(hasAssistant ? (["assistente"] as Tab[]) : []), "sobre"];
  const activeBoost = isPromotionActive(house.boost?.expiresAt) ? house.boost : undefined;

  return (
    <div className="pb-16 lg:pb-4">
      <Card className="overflow-hidden">
        <div className="relative h-40 sm:h-52 md:h-64 bg-muted">
          <img src={house.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {activeBoost && (
            <Badge tone="gold" className="absolute top-4 right-4 shadow-card">
              <TrendingUp className="h-3 w-3" /> Impulsionamento demonstrativo · {activeBoost.level}
            </Badge>
          )}
        </div>
        <div className="px-4 sm:px-6 pb-5">
          {/* Foto redonda sobre a capa, nome logo abaixo e os botões em uma linha própria. */}
          <div className="relative z-10 -mt-14 sm:-mt-16 w-fit rounded-full p-1.5 bg-card shadow-card">
            <Avatar src={house.avatar} name={house.name} size={112} className="ring-2 ring-gold" />
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-2xl md:text-3xl leading-tight">{house.name}</h1>
            {house.verified && <Badge tone="primary"><CheckCircle2 className="h-3 w-3" /> Verificada</Badge>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-x-3 gap-y-1 flex-wrap mt-1">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[house.city, house.state].filter(Boolean).join(", ")}</span>
            {house.category && (<><span aria-hidden>·</span><span>{house.category}</span></>)}
            {house.rating > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-gold fill-gold" /> {house.rating.toFixed(1)}</span>
              </>
            )}
            {followers > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{followers.toLocaleString("pt-BR")} {followers === 1 ? "seguidor" : "seguidores"}</span>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {isOwn ? (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar página</Button>
                <Button onClick={() => nav("/impulsionar")}><TrendingUp className="h-4 w-4" /> Divulgar</Button>
                {isRemoteAuth && <Button variant="outline" onClick={() => nav("/painel/membros")}><Users className="h-4 w-4" /> Membros</Button>}
              </>
            ) : (
              <>
                <Button onClick={() => nav(`/mensagens/${house.id}`)}><MessageCircle className="h-4 w-4" /> Chat</Button>
                {realHouse ? (
                  <Button variant={following ? "secondary" : "outline"} disabled={followBusy} aria-pressed={following} onClick={() => void toggleFollow()}>
                    {following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} {following ? "Seguindo" : "Seguir"}
                  </Button>
                ) : (
                  <Button variant="outline" disabled title="Seguir só funciona com conta real"><UserPlus className="h-4 w-4" /> Seguir</Button>
                )}
              </>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-3xl">{house.bio}</p>
          {house.offerings && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4 max-w-3xl">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Trabalhos que a casa realiza</div>
              <p className="mt-1 text-sm whitespace-pre-line">{house.offerings}</p>
              {!isOwn && <p className="mt-2 text-xs text-muted-foreground">Não encontrou o que procura nas publicações? Fale com a casa ou com a assistente.</p>}
            </div>
          )}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {house.tags.map((t) => (
              <Badge key={t} tone="muted">{t}</Badge>
            ))}
          </div>

          <div className="mt-5 flex gap-1 border-b border-border overflow-x-auto whitespace-nowrap" role="tablist">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-3 text-sm font-semibold transition -mb-px shrink-0",
                  tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {isOwn && <EditProfileModal open={editing} onClose={() => setEditing(false)} />}
      {isOwn && hasServices && <HouseRefundCases ownerId={house.id} />}

      <div className="mt-4 space-y-4">
        {tab === "feed" && housePosts.map((p) => <PostCard key={p.id} post={p} />)}
        {tab === "feed" && housePosts.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Ainda não há publicações desta casa.</Card>
        )}
        {tab === "rituais" && hasServices && <RitualsTab ownerId={house.id} isOwn={isOwn} startNew={params.get("novo") === "1"} onAskAssistant={hasAssistant ? () => setTab("assistente") : undefined} />}
        {tab === "rituais" && !hasServices && houseRituals.map((r) => <RitualCard key={r.id} ritual={r} />)}
        {tab === "rituais" && !hasServices && houseRituals.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Esta casa ainda não publicou rituais.</Card>
        )}
        {tab === "servicos" && hasServices && <ServicesTab ownerId={house.id} isOwn={isOwn} startNew={params.get("novo") === "1"} onAskAssistant={hasAssistant ? () => setTab("assistente") : undefined} />}
        {tab === "avaliacoes" && hasReviews && <ReviewsTab ownerId={house.id} isOwn={isOwn} canReview={currentUser?.type === "personal"} />}
        {tab === "assistente" && hasAssistant && <AssistantChat houseId={house.id} houseName={house.name} />}
        {tab === "sobre" && (
          <Card className="p-6 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Sobre a casa</div>
              <p className="mt-2">{house.bio}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Categoria" value={house.category} />
              <Stat label="Localização" value={`${house.city} · ${house.state}`} />
              {followers > 0 && <Stat label="Seguidores" value={followers.toLocaleString("pt-BR")} />}
              {house.rating > 0 && <Stat label="Avaliação" value={`${house.rating.toFixed(1)} ★`} />}
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
