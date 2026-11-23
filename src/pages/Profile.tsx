import { useApp } from "@/contexts/AppContext";
import { Avatar, Badge, Button, Card } from "@/components/base";
import { MapPin, Pencil } from "lucide-react";
import { useState } from "react";
import EditProfileModal from "@/components/profile/EditProfileModal";
import AssistantSettings from "@/components/assistant/AssistantSettings";
import SecurityWordCard from "@/components/account/SecurityWordCard";
import ClientAccount from "@/pages/ClientAccount";

export default function Profile() {
  const { currentUser } = useApp();
  const [editing, setEditing] = useState(false);
  if (!currentUser) return null;
  // Cliente tem a tela "Minha conta" (abas); aqui fica só o perfil e a assistente da casa.
  if (currentUser.type !== "commercial") return <ClientAccount />;

  return (
    <div className="space-y-4 pb-16 lg:pb-4">
      <Card className="overflow-hidden">
        <div className="relative h-24 sm:h-28 overflow-hidden bg-gradient-to-br from-[#14543F] to-[#0A2E22] border-b-2 border-gold/60" aria-hidden><div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #F4DC92 1px, transparent 0)", backgroundSize: "24px 24px" }} /></div>
        <div className="px-5 sm:px-6 pb-6">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="relative z-10 rounded-full p-1.5 bg-card shadow-card ring-1 ring-gold/60">
              <Avatar src={currentUser.avatar} name={currentUser.name} size={88} />
            </div>
            <Button variant="outline" size="sm" className="mb-1 shrink-0" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar perfil
            </Button>
          </div>
          <h1 className="mt-3 font-display font-bold text-2xl sm:text-3xl leading-tight break-words">{currentUser.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge tone="forest">Casa espiritual</Badge>
            {(currentUser.city || currentUser.state) && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[currentUser.city, currentUser.state].filter(Boolean).join(", ")}</span>
            )}
          </div>
          {currentUser.bio && <p className="mt-4 text-sm text-muted-foreground">{currentUser.bio}</p>}
        </div>
      </Card>
      <EditProfileModal open={editing} onClose={() => setEditing(false)} />
      <AssistantSettings />
      <SecurityWordCard />
      {/* A casa tem a aparência no topo e o modo discreto em Preferências, no Início; aqui ficam só o perfil e a assistente. */}

    </div>
  );
}
