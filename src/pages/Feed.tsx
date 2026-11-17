import { useApp } from "@/contexts/AppContext";
import StoryRail from "@/components/feed/StoryRail";
import PostComposer from "@/components/feed/PostComposer";
import PostCard from "@/components/feed/PostCard";
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

export default function Feed() {
  const { posts, refreshRemote, isRemoteAuth } = useApp();
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
  const ranked = useMemo(() => rankFeed(posts, { boostedPostIds: promo.boostedPostIds }), [posts, promo.boostedPostIds]);
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
      <PendingReviewsCard />
      <Card className="page-hero p-5">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gold-ink">Comunidade</div>
        <h1 className="font-display font-bold text-2xl mt-1">O que as casas estão compartilhando</h1>
        <p className="text-sm text-muted-foreground mt-1">Momentos, rituais e novidades de quem você acompanha.</p>
      </Card>
      <div>
        <div className="flex items-end justify-between mb-2">
          <h2 className="font-display font-bold text-xl">Momentos das casas</h2>
          <Link to="/descobrir" className="text-xs text-primary font-semibold hover:underline">ver todas</Link>
        </div>
        <StoryRail />
      </div>

      {isRemoteAuth && <FeedPromos owners={promo.highlightOwners} idByOwner={promo.idByOwner} boosted={promo.boosted} />}

      <PostComposer />

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
        ) : <PromotedBanner key={idx} />
      )}
    </div>
  );
}

function PromotedBanner() {
  return (
    <Card className="p-5 relative overflow-hidden border-0 text-white shadow-altar" style={{ background: "linear-gradient(135deg,#14543F,#0F3B2D)" }}>
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gold/25 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gold text-gold-foreground grid place-items-center shadow-card">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-gold">Publi · Ilê Conecta</div>
          <div className="font-display font-bold text-lg">Simule o alcance da sua casa</div>
          <div className="text-sm text-white/75">Experimente planos demonstrativos. Nenhuma mídia será comprada nem haverá cobrança real.</div>
        </div>
        <Link to="/impulsionar" className="px-4 py-2.5 rounded-[14px] bg-gold text-gold-foreground text-sm font-semibold shadow-card hover:brightness-105 transition">
          Impulsionar
        </Link>
      </div>
    </Card>
  );
}
