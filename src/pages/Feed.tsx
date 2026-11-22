import { useApp } from "@/contexts/AppContext";
import MomentsRail from "@/components/feed/MomentsRail";
import { useReach } from "@/lib/useReach";
import { canSee, reachSets } from "@/lib/reachCore.js";
import WelcomeClient from "@/components/feed/WelcomeClient";
import LocationPrompt from "@/components/profile/LocationPrompt";
import PlaceNow from "@/components/profile/PlaceNow";
import NearYou from "@/components/feed/NearYou";
import PostComposer from "@/components/feed/PostComposer";
import PostCard from "@/components/feed/PostCard";
import ClientHome, { ClientSearchBar } from "@/components/feed/ClientHome";
import PendingReviewsCard from "@/components/reviews/PendingReviewsCard";
import { Card } from "@/components/base";
import { Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { usePromoRanking } from "@/lib/usePromoRanking";
import { rankFeed } from "@/lib/promotionsCore";
import PromoTrack from "@/components/promo/PromoTrack";
import FeedPromos from "@/components/promo/FeedPromos";
import type { Post } from "@/types";
import { CATEGORIES, matchesFilter } from "@/lib/postCategoryCore.js";

export default function Feed({ home = false }: { home?: boolean }) {
  const { posts, refreshRemote, isRemoteAuth, currentUser, users } = useApp();
  const isClient = home && currentUser?.type === "personal";
  const promo = usePromoRanking(isRemoteAuth);
  // Link de um aviso (curtida/comentário): abre o feed já na publicação, destacada por alguns segundos.
  const [params] = useSearchParams();
  const wanted = params.get("post");
  const [flash, setFlash] = useState<string | null>(null);

  // Traz publicações novas de outras casas ao abrir o feed.
  useEffect(() => {
    void refreshRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // As casas em destaque ficam num bloco próprio (FeedPromos); aqui só as publicações impulsionadas entram intercaladas.
  const [filter, setFilter] = useState("todos");
  const viewerCity = currentUser?.city ?? "";
  // Alcance (conta real): só casas seguidas, com vínculo, em destaque ou o que está impulsionado; o link de uma publicação compartilhada sempre abre.
  const restrict = isRemoteAuth && currentUser?.type !== "commercial"; // casas continuam vendo a rede; a regra vale para clientes
  const reach = useReach(restrict, currentUser?.id);
  const sets = useMemo(
    () => reachSets({ follows: reach.follows, bonds: reach.bonds, highlightOwners: promo.highlightOwners, boostedItemIds: [...promo.boostedIds] }),
    [reach.follows, reach.bonds, promo.highlightOwners, promo.boostedIds]
  );
  const allowOwner = useMemo(() => (restrict && reach.ready ? (ownerId: string, itemId?: string) => canSee({ viewerId: currentUser?.id, ownerId, itemId }, sets) : undefined), [restrict, reach.ready, sets, currentUser?.id]);
  const visible = useMemo(
    () => (restrict && !reach.ready ? [] : posts)
      .filter((p) => !restrict || p.id === wanted || canSee({ viewerId: currentUser?.id, ownerId: p.houseId, itemId: p.id }, sets))
      .filter((p) => matchesFilter(filter, { category: p.category, authorCity: users.find((u) => u.id === p.houseId)?.city, viewerCity })),
    [posts, filter, users, viewerCity, restrict, reach.ready, sets, wanted, currentUser?.id]
  );
  const ranked = useMemo(() => rankFeed(visible, { boostedPostIds: promo.boostedPostIds }), [visible, promo.boostedPostIds]);
  const feedItems: ({ kind: "post"; data: Post; tag: "destaque" | "promovido" | null } | { kind: "promo" })[] = [];
  ranked.forEach((r, i) => {
    feedItems.push({ kind: "post", data: r.post, tag: r.tag });
    if (i === 1) feedItems.push({ kind: "promo" });
  });

  const found = wanted ? posts.some((p) => p.id === wanted) : false;
  useEffect(() => {
    if (!wanted || !found) return;
    const el = document.getElementById(`post-${wanted}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(wanted);
    const t = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(t);
  }, [wanted, found]);

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      {isClient && <ClientSearchBar />}
      {isClient && <ClientHome />}
      {isClient && <PendingReviewsCard />}
      {isClient ? <h1 className="sr-only">Início</h1> : (
        <Card className="page-hero px-5 py-3">
          <h1 className="font-display font-bold text-xl break-words">Comunidade</h1>
        </Card>
      )}
      <PostComposer />

      {isClient && <LocationPrompt />}
      {isClient && <PlaceNow />}
      {isClient && restrict && reach.ready && reach.follows.length + reach.bonds.length === 0 && <WelcomeClient name={currentUser?.name} />}
      {isClient && isRemoteAuth && <NearYou highlightOwners={promo.highlightOwners} allow={allowOwner ?? (() => false)} />}
      <div>
        <MomentsRail highlightOwners={promo.highlightOwners} allow={restrict ? (allowOwner ? (o: string) => allowOwner(o) : () => false) : undefined} />
      </div>

      <div role="group" aria-label="Filtrar publicações" className="sticky top-[60px] z-20 flex gap-2 overflow-x-auto rounded-full border border-border bg-background/95 px-2 py-2 backdrop-blur scroll-x">
        {[{ id: "todos", label: "Todos" }, ...CATEGORIES].map((c) => {
          const on = filter === c.id;
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => setFilter(c.id)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}>
              {c.label}
            </button>
          );
        })}
      </div>

      {isRemoteAuth && <FeedPromos owners={promo.highlightOwners} idByOwner={promo.idByOwner} boosted={promo.boosted} />}

      {filter === "todos" && restrict && reach.ready && reach.follows.length + reach.bonds.length > 0 && feedItems.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">As casas que você segue ainda não publicaram. Quando publicarem, aparece aqui.</Card>
      )}
      {filter !== "todos" && feedItems.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma publicação neste filtro ainda.
        </Card>
      )}
      {feedItems.map((item, idx) =>
        item.kind === "post" ? (
          <div key={item.data.id} id={`post-${item.data.id}`} data-flash={flash === item.data.id ? "1" : undefined} className={flash === item.data.id ? "rounded-3xl ring-2 ring-gold ring-offset-2 transition" : undefined}>
          <PromoTrack promoId={item.tag === "destaque" ? promo.idByOwner.get(item.data.houseId) : item.tag === "promovido" ? promo.idByItem.get(item.data.id) : undefined}>
            {item.tag && (
              <div className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gold-ink">
                {item.tag === "destaque" ? <><Star className="h-3 w-3" aria-hidden /> Em destaque</> : "Promovido"}
              </div>
            )}
            <PostCard post={item.data} />
          </PromoTrack>
          </div>
        ) : (currentUser?.type === "commercial" ? <PromotedBanner key={idx} /> : null)
      )}
    </div>
  );
}

function PromotedBanner() {
  return (
    <Card className="flex items-center gap-3 border-gold/40 p-3.5">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold text-gold-foreground"><Sparkles className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Alcance quem ainda não segue sua casa</span>
        <span className="block text-xs text-muted-foreground">Impulsione uma publicação ou coloque a casa em destaque.</span>
      </span>
      <Link to="/impulsionar" className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Impulsionar</Link>
    </Card>
  );
}
