import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Heart, MapPin, Pencil, Sparkles } from "lucide-react";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import EditProfileModal from "@/components/profile/EditProfileModal";
import ThemeSwitch from "@/components/profile/ThemeSwitch";
import DiscreetModeCard from "@/components/profile/DiscreetModeCard";
import Activity from "@/pages/Activity";
import Mensalidades from "@/pages/Mensalidades";
import { fetchMemberships } from "@/lib/members";
import { timeAgo, cn } from "@/lib/utils";

type Tab = "perfil" | "atividade" | "mensalidades";
const LABEL: Record<Tab, string> = { perfil: "Perfil", atividade: "Atividade", mensalidades: "Mensalidades" };

/** "Minha conta" do cliente: Perfil, Atividade e (só para quem é membro de uma casa) Mensalidades, numa tela só. */
export default function ClientAccount() {
  const { currentUser, isRemoteAuth, posts } = useApp();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  // null = ainda carregando; [] = não é membro de nenhuma casa
  const [memberCount, setMemberCount] = useState<number | null>(isRemoteAuth ? null : 0);
  useEffect(() => {
    if (!isRemoteAuth) return;
    let alive = true;
    void fetchMemberships().then((l) => alive && setMemberCount(l.length));
    return () => { alive = false; };
  }, [isRemoteAuth]);
  if (!currentUser) return null;

  const isMember = (memberCount ?? 0) > 0;
  const tabs: Tab[] = isMember ? ["perfil", "atividade", "mensalidades"] : ["perfil", "atividade"];
  const wanted = params.get("aba");
  const loadingMembers = wanted === "mensalidades" && memberCount === null;
  const tab: Tab = wanted === "atividade" ? "atividade" : wanted === "mensalidades" && isMember ? "mensalidades" : "perfil";
  const go = (t: Tab) => setParams(t === "perfil" ? {} : { aba: t }, { replace: true });
  const myPosts = posts.filter((p) => p.houseId === currentUser.id);
  const place = [currentUser.city, currentUser.state].filter(Boolean).join(", ");
  const interests = currentUser.type === "personal" ? currentUser.interests ?? [] : [];

  return (
    <div className="space-y-3 pb-16 lg:pb-4">
      <Card className="overflow-hidden">
        <div className="relative h-24 sm:h-32 overflow-hidden bg-gradient-to-br from-[#14543F] to-[#0A2E22] border-b-2 border-gold/60" aria-hidden>
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #F4DC92 1px, transparent 0)", backgroundSize: "24px 24px" }} />
        </div>
        <div className="px-4 pb-5 text-center sm:px-6">
          <div className="relative z-10 -mt-12 mx-auto flex w-fit rounded-full p-1.5 bg-card shadow-card ring-1 ring-gold/60 [&>*]:block [&_img]:block">
            <Avatar src={currentUser.avatar} name={currentUser.name} size={92} />
          </div>
          <h1 className="mt-3 font-display font-bold text-2xl sm:text-3xl leading-tight break-words">{currentUser.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge tone="forest">Cliente</Badge>
            {place && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {place}</span>}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar perfil</Button>
        </div>
      </Card>
      <EditProfileModal open={editing} onClose={() => setEditing(false)} />

      <div className="relative">
        <div className="scroll-x flex gap-1 rounded-2xl border border-border bg-card px-2 whitespace-nowrap" role="tablist" aria-label="Minha conta">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => go(t)}
              className={cn("shrink-0 border-b-[3px] px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {loadingMembers && <div className="h-24" aria-busy />}
      {!loadingMembers && tab === "perfil" && (
        <div className="space-y-3">
          <Card className="p-5">
            <h2 className="font-display font-bold text-lg">Sobre mim</h2>
            {currentUser.bio ? <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{currentUser.bio}</p> : <p className="mt-2 text-sm text-muted-foreground">Conte um pouco sobre você para as casas conhecerem quem fala com elas.</p>}
            {interests.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{interests.map((i) => <Badge key={i} tone="muted">{i}</Badge>)}</div>}
            {!currentUser.bio && interests.length === 0 && <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}><Sparkles className="h-4 w-4" /> Completar o perfil</Button>}
          </Card>
          <ThemeSwitch />
          <DiscreetModeCard />
        </div>
      )}
      {!loadingMembers && tab === "atividade" && (
        <div className="space-y-3">
          <Activity embedded />
          {myPosts.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3"><Heart className="h-5 w-5 text-primary" aria-hidden /><h2 className="font-display font-bold text-lg">Minhas publicações</h2></div>
              <div className="space-y-2">
                {myPosts.map((p) => (
                  <div key={p.id} className="p-3 border border-border rounded-xl text-sm pillow">
                    <div className="text-xs text-muted-foreground">{timeAgo(p.createdAt)}</div>
                    <div>{p.content}</div>
                  </div>
                ))}
              </div>
              <Link to="/comunidade" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">Ir para a Comunidade →</Link>
            </Card>
          )}
        </div>
      )}
      {!loadingMembers && tab === "mensalidades" && <Mensalidades embedded />}
    </div>
  );
}
