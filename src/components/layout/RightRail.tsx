import { Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Card } from "@/components/base";
import { Flame, Sparkles, Star } from "lucide-react";
import { formatBRL } from "@/lib/utils";

export default function RightRail() {
  const { users, rituals, conversations, currentUser } = useApp();

  const promoted = users
    .filter((u) => u.type === "commercial")
    .filter((u: any) => u.boost)
    .slice(0, 3);

  const hotRituals = rituals
    .slice()
    .sort((a, b) => b.vagasVendidas / b.vagasTotal - a.vagasVendidas / a.vagasTotal)
    .slice(0, 3);

  const activeChats = conversations
    .filter((c) => currentUser && c.participantIds.includes(currentUser.id))
    .slice(0, 4);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-display font-bold">
            <Flame className="h-4 w-4 text-primary" /> Casas em destaque
          </div>
          <Badge tone="gold">Impulsionadas</Badge>
        </div>
        <div className="space-y-3">
          {promoted.map((h: any) => (
            <Link key={h.id} to={`/casa/${h.id}`} className="flex items-center gap-3 -mx-1 px-1 py-1 rounded-xl hover:bg-muted transition">
              <Avatar src={h.avatar} name={h.name} size={40} ring="gold" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{h.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {h.city}, {h.state} · {h.category}
                </div>
              </div>
              <Badge tone="primary" className="capitalize">{h.boost?.level}</Badge>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 font-display font-bold mb-3">
          <Sparkles className="h-4 w-4 text-gold" /> Rituais em alta
        </div>
        <div className="space-y-3">
          {hotRituals.map((r) => {
            const rem = r.vagasTotal - r.vagasVendidas;
            return (
              <Link key={r.id} to={`/rituais/${r.id}`} className="flex items-center gap-3 -mx-1 px-1 py-1 rounded-xl hover:bg-muted transition">
                <img src={r.cover} alt="" className="h-12 w-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBRL(r.price)} · <span className={rem < 20 ? "text-primary font-semibold" : ""}>{rem} vagas</span>
                  </div>
                </div>
                <Star className="h-4 w-4 text-gold shrink-0" />
              </Link>
            );
          })}
        </div>
      </Card>

      {activeChats.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Conversas recentes</div>
          <div className="space-y-2">
            {activeChats.map((c) => {
              const otherId = c.participantIds.find((id) => id !== currentUser?.id) || "";
              const other = users.find((u) => u.id === otherId);
              const last = c.messages[c.messages.length - 1];
              return (
                <Link key={c.id} to={`/mensagens/${otherId}`} className="flex items-center gap-3 -mx-1 px-1 py-1 rounded-xl hover:bg-muted transition">
                  <Avatar src={other?.avatar} name={other?.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{other?.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{last?.text}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      <div className="text-[11px] text-muted-foreground px-2 leading-relaxed">
        © {new Date().getFullYear()} Ilê Conecta · Rede das Casas de Religião Afro. Respeite todas as tradições.
      </div>
    </div>
  );
}
