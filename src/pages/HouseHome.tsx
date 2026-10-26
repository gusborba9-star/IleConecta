import { Link, useNavigate } from "react-router-dom";
import { Megaphone, Newspaper, Pencil, Plus, Sparkles, TrendingUp } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import type { HouseUser } from "@/types";

/** Página inicial da conta de casa: o que fazer agora, e não o feed da comunidade. */
export default function HouseHome() {
  const { currentUser } = useApp();
  const nav = useNavigate();
  const house = currentUser?.type === "commercial" ? (currentUser as HouseUser) : null;
  if (!house) return null;

  const tiles = [
    { icon: Plus, title: "Novo serviço", text: "Búzios, cartas, trabalhos, consultas", onClick: () => nav(`/casa/${house.id}?aba=servicos&novo=1`) },
    { icon: Sparkles, title: "Novo ritual", text: "Evento coletivo com vagas ao vivo", onClick: () => nav(`/casa/${house.id}?aba=rituais&novo=1`) },
    { icon: Newspaper, title: "Publicar", text: "Texto e foto para a comunidade", onClick: () => nav("/comunidade") },
    { icon: TrendingUp, title: "Divulgar a casa", text: "Impulsionar ou destacar", onClick: () => nav("/impulsionar") },
    { icon: Pencil, title: "Editar perfil", text: "Foto, capa e apresentação da casa", onClick: () => nav(`/casa/${house.id}?editar=1`) },
  ];

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="p-6 bg-gradient-to-br from-primary/10 via-gold/10 to-forest/10 border-gold/40">
        <h1 className="font-display font-bold text-2xl">Olá, {house.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Aqui está o que você pode fazer pela sua casa hoje.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => nav(`/casa/${house.id}`)}>Ver minha página</Button>
          <Button variant="outline" onClick={() => nav("/comunidade")}>Ir para a comunidade</Button>
        </div>
      </Card>

      <section aria-label="Atalhos" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {tiles.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={t.onClick}
            className="text-left rounded-2xl border border-border bg-card p-4 min-h-24 transition hover:bg-muted"
          >
            <span className="flex items-center gap-2 font-semibold"><t.icon className="h-4 w-4 text-primary" />{t.title}</span>
            <span className="block text-sm text-muted-foreground mt-1">{t.text}</span>
          </button>
        ))}
      </section>

      <Card className="p-5">
        <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /><h2 className="font-display font-bold text-lg">Assistente virtual</h2></div>
        <p className="text-sm text-muted-foreground mt-1">Configure como a assistente atende os seus clientes.</p>
        <Link to="/perfil" className="inline-block mt-2 text-sm font-semibold text-primary">Configurar assistente</Link>
      </Card>
    </div>
  );
}
