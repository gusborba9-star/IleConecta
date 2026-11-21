import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Plus, Play } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/base";
import MomentViewer from "@/components/feed/MomentViewer";
import MomentComposer from "@/components/feed/MomentComposer";
import { useOwnerPlan } from "@/lib/housePlan";
import { usePlatformConfig } from "@/contexts/PlatformConfigContext";
import { minPlanFor } from "@/lib/planMatrixCore";
import { FREE_PLAN_NAME } from "@/lib/platformConfigCore";
import { deleteMoment, fetchHouseId, fetchMomentGroups, fetchMyMoments } from "@/lib/moments";
import { canPostMoments, isGroupSeen, sortGroups, startIndex, type MomentGroup } from "@/lib/momentsCore";
import { readSeen, saveSeen } from "@/lib/momentsSeen";

/** Carrossel de momentos no topo do feed. Só casas publicam (a partir do Essencial); cliente só assiste. */
export default function MomentsRail({ highlightOwners = [] }: { highlightOwners?: string[] }) {
  const { currentUser, isRemoteAuth, stories, users } = useApp();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const isHouse = currentUser?.type === "commercial";
  const { caps } = useOwnerPlan(isHouse ? currentUser?.id : null);
  const { config } = usePlatformConfig();
  const minPlan = minPlanFor(config.plan_matrix, "moments_per_day");
  const minName = !minPlan ? "superior" : minPlan === "gratis" ? FREE_PLAN_NAME : config.pricing.plans[minPlan].name;
  const [remote, setRemote] = useState<MomentGroup[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(readSeen);
  const [open, setOpen] = useState<{ gi: number; ii: number } | null>(null);
  const [composing, setComposing] = useState(false);

  const reload = useCallback(async () => { if (isRemoteAuth) setRemote(await fetchMomentGroups()); }, [isRemoteAuth]);
  useEffect(() => { void reload(); }, [reload]);

  // Modo demonstração (sem banco): usa as fotos de exemplo do protótipo, só para olhar.
  const demo = useMemo<MomentGroup[]>(() => {
    if (isRemoteAuth) return [];
    const by = new Map<string, MomentGroup>();
    for (const s of stories) {
      const h = users.find((u) => u.id === s.houseId);
      if (h?.type !== "commercial") continue;
      const g = by.get(h.id) ?? { ownerId: h.id, houseId: h.id, name: h.name, slug: "", avatar: h.avatar, followed: false, items: [] };
      g.items.push({ id: s.id, kind: "image", url: s.image, poster: null, caption: s.caption ?? null, createdAt: s.createdAt, expiresAt: new Date(Date.parse(s.createdAt) + 24 * 3600e3).toISOString(), duration: null, link: null, liked: false, music: null, views: null, likes: null, comments: null });
      by.set(h.id, g);
    }
    return [...by.values()];
  }, [isRemoteAuth, stories, users]);

  const groups = useMemo(() => sortGroups(remote ?? demo, { highlightOwners, seen }), [remote, demo, highlightOwners, seen]);
  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      saveSeen(next, [...(remote ?? demo)].flatMap((g) => g.items.map((i) => i.id)));
      return next;
    });
  }, [remote, demo]);

  const remove = useCallback(async (id: string) => {
    if (!currentUser) return false;
    const hid = await fetchHouseId(currentUser.id);
    const mine = hid ? await fetchMyMoments(hid) : [];
    const m = mine.find((x) => x.id === id);
    if (!m || !(await deleteMoment(m))) return false;
    await reload();
    return true;
  }, [currentUser, reload]);

  const canPost = isRemoteAuth && isHouse && canPostMoments(caps);
  const showUpsell = isRemoteAuth && isHouse && caps !== null && !canPostMoments(caps);
  // Atalho "Momentos" do Início da casa (`/comunidade?novo=momento`): abre o editor direto (uma vez; o endereço é limpo para não reabrir).
  const [params, setParams] = useSearchParams();
  const wantsNew = params.get("novo") === "momento";
  useEffect(() => {
    if (!wantsNew || !canPost) return;
    setComposing(true);
    setParams((p) => { const n = new URLSearchParams(p); n.delete("novo"); return n; }, { replace: true });
  }, [wantsNew, canPost, setParams]);

  return (
    <>
      <div className="scroll-x -mx-1 px-1" role="region" aria-label="Momentos das casas">
        <div className="flex gap-3 pb-1">
          {canPost && currentUser && (
            <button type="button" onClick={() => setComposing(true)} className="shrink-0 w-32 h-52 rounded-2xl border-2 border-dashed border-gold/60 bg-card flex flex-col items-center justify-center gap-2 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
              <span className="h-11 w-11 rounded-full bg-primary/10 text-primary grid place-items-center"><Plus className="h-5 w-5" aria-hidden /></span>
              <span className="text-xs font-semibold text-center px-2">Criar momento</span>
            </button>
          )}
          {showUpsell && (
            <Link to="/planos?aba=mudar" className="shrink-0 w-32 h-52 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-2 px-2 text-center hover:bg-muted/40">
              <span className="h-11 w-11 rounded-full bg-muted grid place-items-center"><Lock className="h-5 w-5 text-muted-foreground" aria-hidden /></span>
              <span className="text-xs font-semibold">Momentos a partir do plano {minName}</span>
              <span className="text-[11px] text-primary font-semibold">Ver planos</span>
            </Link>
          )}
          {groups.map((g, gi) => {
            const done = isGroupSeen(g, seen);
            const first = g.items[startIndex(g, seen)];
            const thumb = first.kind === "video" ? first.poster ?? first.url : first.url;
            return (
              <button
                key={g.ownerId} type="button" data-testid="moment-card"
                aria-label={`Ver momentos de ${g.name}${done ? " (já vistos)" : ""}`}
                onClick={() => setOpen({ gi, ii: startIndex(g, seen) })}
                className="relative shrink-0 w-32 h-52 rounded-2xl overflow-hidden shadow-card text-left focus-visible:ring-2 focus-visible:ring-ring bg-[#0b2a1f]"
              >
                {!broken[thumb] && <img src={thumb} alt="" aria-hidden loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" onError={() => setBroken((b) => ({ ...b, [thumb]: true }))} />}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/5 from-40% to-black/70" />
                <span className={`absolute top-2 left-2 rounded-full ${done ? "ring-2 ring-white/60" : "ring-2 ring-gold"} ring-offset-1 ring-offset-black/30`}>
                  <Avatar src={g.avatar} name={g.name} size={34} />
                </span>
                {first.kind === "video" && <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/50 grid place-items-center text-white"><Play className="h-3 w-3" aria-hidden /></span>}
                <span className="absolute inset-x-2 bottom-2 text-white text-xs font-semibold line-clamp-2 drop-shadow">{g.name}</span>
              </button>
            );
          })}
          {groups.length === 0 && !canPost && !showUpsell && (
            <p className="w-full rounded-2xl border border-dashed border-border grid place-items-center text-center text-xs text-muted-foreground px-4 py-4">Quando as casas que você acompanha publicarem momentos, eles aparecem aqui por 24 horas.</p>
          )}
        </div>
      </div>
      {open && groups[open.gi] && (
        <MomentViewer groups={groups} start={open} viewerId={isRemoteAuth ? currentUser?.id : null} onSeen={markSeen} onClose={() => setOpen(null)} onDelete={isRemoteAuth ? remove : undefined} />
      )}
      {composing && currentUser && (
        <MomentComposer open ownerId={currentUser.id} caps={caps} onClose={() => setComposing(false)} onPublished={() => void reload()} />
      )}
    </>
  );
}
