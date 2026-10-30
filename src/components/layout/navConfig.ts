import { Newspaper, Home, Compass, Sparkles, MessageCircle, User, TrendingUp, Star, Crown, History, Settings, LifeBuoy, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavEntry { to: string; icon: LucideIcon; label: string; tone?: "gold" }
export interface NavGroup { title?: string; items: NavEntry[] }

/** Menu único: a lateral do computador e o menu "Mais" do celular mostram exatamente os mesmos grupos. */
export function navGroups({ isHouse, isRemoteAuth, userId }: { isHouse: boolean; isRemoteAuth: boolean; userId?: string }): NavGroup[] {
  if (isHouse) {
    return [
      { items: [
        { to: "/", icon: Home, label: "Início" },
        { to: "/mensagens", icon: MessageCircle, label: "Mensagens" },
        ...(isRemoteAuth ? [{ to: "/painel/membros", icon: Users, label: "Membros" }] : []),
      ] },
      { title: "Explorar", items: [
        ...(isRemoteAuth ? [{ to: "/comunidade", icon: Newspaper, label: "Comunidade" }] : []),
        { to: "/descobrir", icon: Compass, label: "Casas" },
        { to: "/rituais", icon: Sparkles, label: "Rituais" },
      ] },
      { title: "Minha casa", items: [
        { to: `/casa/${userId ?? ""}`, icon: User, label: "Minha página" },
        { to: "/perfil", icon: Settings, label: "Perfil e assistente" },
      ] },
      { title: "Crescer", items: [
        { to: "/planos", icon: Crown, label: "Planos e upgrade", tone: "gold" },
        { to: "/impulsionar", icon: TrendingUp, label: "Impulsionar", tone: "gold" },
        { to: "/destaques", icon: Star, label: "Destaques nos feeds", tone: "gold" },
      ] },
      { items: [{ to: "/suporte", icon: LifeBuoy, label: "Suporte" }] },
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
      { to: "/atividade", icon: History, label: "Minha atividade" },
      ...(isRemoteAuth ? [{ to: "/mensalidades", icon: Wallet, label: "Mensalidades" }] : []),
      { to: "/perfil", icon: User, label: "Meu perfil" },
    ] },
    { items: [{ to: "/suporte", icon: LifeBuoy, label: "Suporte" }] },
  ];
}
