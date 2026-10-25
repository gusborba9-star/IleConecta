import { useApp } from "@/contexts/AppContext";
import StoryRail from "@/components/feed/StoryRail";
import PostComposer from "@/components/feed/PostComposer";
import PostCard from "@/components/feed/PostCard";
import { Card } from "@/components/base";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function Feed() {
  const { posts, users } = useApp();

  // Insert a promoted card between posts
  const feedItems: any[] = [];
  posts.forEach((p, i) => {
    feedItems.push({ kind: "post", data: p });
    if (i === 1) feedItems.push({ kind: "promo" });
  });

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <div>
        <div className="flex items-end justify-between mb-2">
          <h2 className="font-display font-bold text-xl">Momentos das casas</h2>
          <Link to="/descobrir" className="text-xs text-primary font-semibold hover:underline">ver todas</Link>
        </div>
        <StoryRail />
      </div>

      <PostComposer />

      {feedItems.map((item, idx) =>
        item.kind === "post" ? <PostCard key={item.data.id} post={item.data} /> : <PromotedBanner key={idx} />
      )}
    </div>
  );
}

function PromotedBanner() {
  return (
    <Card className="p-5 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40 relative overflow-hidden">
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gold/20 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-card">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Publi · Ilê Conecta</div>
          <div className="font-display font-bold text-lg">Faça sua casa alcançar todo o país</div>
          <div className="text-sm text-muted-foreground">Impulsione por 3, 7 ou 30 dias com preços a partir de R$ 39,90.</div>
        </div>
        <Link to="/impulsionar" className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-card hover:brightness-110 transition">
          Impulsionar
        </Link>
      </div>
    </Card>
  );
}
