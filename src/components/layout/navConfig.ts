import { CalendarDays, Newspaper, Home, Compass, Sparkles, MessageCircle, User, TrendingUp, Crown, Settings, LifeBuoy, Users, UsersRound, Headset, Megaphone, FileText, ClipboardList, Leaf, Landmark, Contact, type LucideIcon } from "lucide-react";

export interface NavEntry { to: string; icon: LucideIcon; label: string; tone?: "gold"; /** Número de pendências mostrado em bolinha (vem da central de pendências da casa). */ badge?: "mensagens" | "pedidos" | "membros" | "faturas" }
export interface NavGroup { title?: string; items: NavEntry[] }

/** Menu único: a lateral do computador e o menu "Mais" do celular mostram exatamente os mesmos grupos. */
export function navGroups({ isHouse, isRemoteAuth, userId, isStaff }: { isHouse: boolean; isRemoteAuth: boolean; userId?: string; isStaff?: boolean }): NavGroup[] {
  if (isHouse) {
    return [
      { items: [
        { to: "/", icon: Home, label: "Início" },
        { to: "/mensagens", icon: MessageCircle, label: "Mensagens", badge: "mensagens" },
        { to: "/pedidos", icon: ClipboardList, label: "Pedidos", badge: "pedidos" },
        ...(isRemoteAuth ? [{ to: "/agenda", icon: CalendarDays, label: "Agenda" }] : []),
        ...(isRemoteAuth ? [{ to: "/painel/membros", icon: Users, label: "Membros", badge: "membros" as const }, { to: "/pessoas", icon: Contact, label: "Pessoas da casa" }] : []),
      ] },
      { title: "Minha casa", items: [
        { to: `/casa/${userId ?? ""}`, icon: Leaf, label: "Minha página" },
        { to: "/perfil", icon: Settings, label: "Perfil e assistente" },
        ...(isRemoteAuth ? [{ to: "/equipe", icon: UsersRound, label: "Equipe da casa" }, { to: "/divulgacao", icon: Megaphone, label: "Divulgação" }, { to: "/recebimentos", icon: Landmark, label: "Recebimentos" }] : []),
      ] },
      { title: "Crescer", items: [
        { to: "/planos", icon: Crown, label: "Planos e faturas", tone: "gold", badge: "faturas" },
        { to: "/impulsionar", icon: TrendingUp, label: "Impulsionar e destaques", tone: "gold" },
      ] },
      { title: "Explorar", items: [
        ...(isRemoteAuth ? [{ to: "/comunidade", icon: Newspaper, label: "Comunidade" }] : []),
        { to: "/descobrir", icon: Compass, label: "Casas" },
        { to: "/rituais", icon: Sparkles, label: "Rituais" },
      ] },
      { items: [{ to: "/termos", icon: FileText, label: "Termos e normas" }, { to: "/suporte", icon: LifeBuoy, label: "Suporte" }] },
    ];
  }
  return [
    { items: [
      { to: "/", icon: Home, label: "Início" },
      { to: "/descobrir", icon: Compass, label: "Casas" },
      { to: "/rituais", icon: Sparkles, label: "Rituais" },
      { to: "/mensagens", icon: MessageCircle, label: "Mensagens" },
    ] },
    { title: "Minha conta", items: [
      ...(isStaff ? [{ to: "/atendimento", icon: Headset, label: "Atendimento da casa", tone: "gold" as const }] : []),
      { to: "/perfil", icon: User, label: "Minha conta" },
    ] },
    { items: [{ to: "/termos", icon: FileText, label: "Termos e normas" }, { to: "/suporte", icon: LifeBuoy, label: "Suporte" }] },
  ];
}
