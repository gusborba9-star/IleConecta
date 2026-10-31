import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Bot, Newspaper, Pencil, Plus, Sparkles, TrendingUp, Users } from "lucide-react";
import { Button, Card } from "@/components/base";
import { useApp } from "@/contexts/AppContext";
import ConsentBox from "@/components/legal/ConsentBox";
import AssistantReportCard from "@/components/house/AssistantReportCard";
import QuietHoursCard from "@/components/house/QuietHoursCard";
import DiscreetModeCard from "@/components/profile/DiscreetModeCard";
import PaymentAccountCard from "@/components/payments/PaymentAccountCard";
import { fetchHouseTermsAccepted, recordConsents } from "@/lib/consents";
import { fetchMembersOverview } from "@/lib/members";
import type { HouseUser } from "@/types";

/** Página inicial da conta de casa: o que fazer agora, e não o feed da comunidade. */
export default function HouseHome() {
  const { currentUser, isRemoteAuth } = useApp();
  const nav = useNavigate();
  const house = currentUser?.type === "commercial" ? (currentUser as HouseUser) : null;
  const [termsOk, setTermsOk] = useState(true);
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<{ total: number; vencidas: number; perto: number } | null>(null);
  const houseId = house?.id;

  useEffect(() => {
    if (!isRemoteAuth || !houseId) return;
    let alive = true;
    void fetchHouseTermsAccepted(houseId).then((ok) => alive && setTermsOk(ok));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, houseId]);

  useEffect(() => {
    if (!isRemoteAuth || !houseId) return;
    let alive = true;
    void fetchMembersOverview().then((o) => alive && o && setMembers(o.summary));
    return () => {
      alive = false;
    };
  }, [isRemoteAuth, houseId]);

  if (!house) return null;

  const acceptTerms = async () => {
    setSaving(true);
    const error = await recordConsents(["termos_casa"]);
    setSaving(false);
    if (error) return void toast.error(error);
    toast.success("Termos aceitos.");
    setTermsOk(true);
  };

  const memberText = !members || members.total === 0 ? "Mensalidades e avisos de cobrança" : members.vencidas > 0 ? `${members.vencidas} em atraso` : members.perto > 0 ? `${members.perto} vencem em breve` : `${members.total} em dia`;
  const tiles = [
    ...(isRemoteAuth ? [{ icon: Users, title: "Membros", text: memberText, badge: members?.vencidas || 0, onClick: () => nav("/painel/membros") }] : []),
    { icon: Plus, title: "Novo serviço", text: "Búzios, cartas, trabalhos, consultas", onClick: () => nav(`/casa/${house.id}?aba=servicos&novo=1`) },
    { icon: Sparkles, title: "Novo ritual", text: "Evento coletivo com vagas ao vivo", onClick: () => nav(`/casa/${house.id}?aba=rituais&novo=1`) },
    { icon: Newspaper, title: "Publicar", text: "Texto e foto para a comunidade", onClick: () => nav("/comunidade") },
    { icon: TrendingUp, title: "Divulgar a casa", text: "Impulsionar ou destacar", onClick: () => nav("/impulsionar") },
    { icon: Pencil, title: "Editar perfil", text: "Foto, capa e apresentação da casa", onClick: () => nav(`/casa/${house.id}?editar=1`) },
    { icon: Bot, title: "Assistente virtual", text: "Como ela atende seus clientes", onClick: () => nav("/perfil") },
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

      {!termsOk && (
        <Card className="p-5 border-gold/50">
          <h2 className="font-display font-bold text-lg">Termos de Uso da Casa Espiritual</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">Para vender rituais e serviços pela plataforma, leia e aceite os termos. Seu aceite fica registrado com data e versão.</p>
          <ConsentBox doc="termos_casa" checked={agree} onChange={setAgree} />
          <Button className="mt-3" disabled={!agree || saving} onClick={() => void acceptTerms()}>{saving ? "Salvando…" : "Aceitar e continuar"}</Button>
        </Card>
      )}

      {isRemoteAuth && <PaymentAccountCard ownerId={house.id} termsOk={termsOk} />}

      <section aria-label="Atalhos" className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={t.onClick}
            className="relative text-left rounded-2xl border border-border bg-card p-4 min-h-24 transition hover:bg-muted"
          >
            {"badge" in t && t.badge > 0 && (
              <span className="absolute right-3 top-3 min-w-5 h-5 px-1.5 rounded-full bg-[hsl(var(--danger))] text-white text-xs font-bold grid place-items-center" aria-label={`${t.badge} em atraso`}>{t.badge}</span>
            )}
            <span className="flex items-center gap-2 font-semibold"><t.icon className="h-4 w-4 text-primary" />{t.title}</span>
            <span className="block text-sm text-muted-foreground mt-1">{t.text}</span>
          </button>
        ))}
      </section>

      <AssistantReportCard />
      <QuietHoursCard />
      <DiscreetModeCard />
    </div>
  );
}
