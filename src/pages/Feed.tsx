import { useApp } from "@/contexts/AppContext";
import MomentsRail from "@/components/feed/MomentsRail";
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
import { MapPin } from "lucide-react";

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
  const visible = useMemo(
    () => posts.filter((p) => matchesFilter(filter, { category: p.category, authorCity: users.find((u) => u.id === p.houseId)?.city, viewerCity })),
    [posts, filter, users, viewerCity]
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

      <div>
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <h2 className="font-display font-bold text-base">Momentos das casas</h2>
          <Link to="/descobrir" className="inline-flex min-h-9 items-center text-xs text-primary font-semibold hover:underline">ver casas</Link>
        </div>
        <MomentsRail highlightOwners={promo.highlightOwners} />
      </div>

      <div role="group" aria-label="Filtrar publicações" className="sticky top-[60px] z-20 flex gap-2 overflow-x-auto rounded-full border border-border bg-background/95 px-2 py-2 backdrop-blur scroll-x">
        {[{ id: "todos", label: "Todos" }, ...CATEGORIES, { id: "perto", label: "Perto de mim" }].map((c) => {
          const on = filter === c.id;
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => setFilter(c.id)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}>
              {c.id === "perto" && <MapPin className="h-3.5 w-3.5" aria-hidden />}{c.label}
            </button>
          );
        })}
      </div>

      {isRemoteAuth && <FeedPromos owners={promo.highlightOwners} idByOwner={promo.idByOwner} boosted={promo.boosted} />}

      {filter !== "todos" && feedItems.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {filter === "perto" && !viewerCity ? "Informe sua cidade em Minha conta para ver o que acontece perto de você." : "Nenhuma publicação neste filtro ainda."}
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
