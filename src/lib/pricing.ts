// Preços e nomes de planos vêm do painel admin (tabela platform_settings). Aqui ficam só os textos
// de benefícios, os formatadores e as regras de dias. Os valores padrão estão em platformConfigCore.js.
import type { Money, PlanId } from "@/lib/platformConfigCore";

export type { Money, PlanId };

export const DAY_PRESETS = [3, 7, 30] as const;
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;

export interface PlanInfo {
  id: PlanId;
  tagline: string;
  benefits: string[];
}

export const PLANS: PlanInfo[] = [
  {
    id: "base",
    tagline: "Tudo para a sua casa receber pessoas.",
    benefits: [
      "Página completa da casa, com foto de perfil, capa e informações",
      "Rituais, jogos e serviços com pagamento pela plataforma",
      "Publicações no feed e avaliações dos clientes",
      "Chat com texto e PDF",
      "Datas públicas na agenda da casa",
    ],
  },
  {
    id: "intermediario",
    tagline: "A casa atendendo a qualquer hora.",
    benefits: [
      "Tudo do Essencial",
      "Lara, a assistente da casa, atende 24h (até 300 respostas por mês) e informa as datas da agenda",
      "Ela conhece a sua casa: serviços, rituais, horários e perguntas frequentes",
      "Passa para você os assuntos delicados, com aviso no sino",
      "Catálogo interno e relatório do atendimento",
    ],
  },
  {
    id: "maximo",
    tagline: "A casa completa, com a comunidade por perto.",
    benefits: [
      "Tudo do Profissional",
      "Lara com até 3.000 respostas por mês",
      "Área de membros e mensalidades, sem planilha",
      "Calendário completo: cada data para o público certo e repetição anual",
      "Fotos e vídeos curtos no chat com os clientes",
      "Vídeo de 30 segundos nos rituais e descontos definidos pela casa",
    ],
  },
];

export function formatMoney(value: Money): string {
  return value === null ? "A definir" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Total = valor por dia × dias, em centavos para evitar erro de ponto flutuante. */
export function totalFor(perDay: Money, days: number): Money {
  if (perDay === null || !Number.isFinite(days) || days < MIN_DAYS) return null;
  return (Math.round(perDay * 100) * Math.floor(days)) / 100;
}

export function clampDays(n: number): number {
  if (!Number.isFinite(n)) return MIN_DAYS;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(n)));
}

export const SCOPE_LABEL: Record<string, { label: string; description: string }> = {
  cidade: { label: "Cidade", description: "Para quem está na mesma cidade da casa." },
  estado: { label: "Estado", description: "Alcance em todo o estado." },
  pais: { label: "País", description: "A casa exibida no Brasil inteiro." },
  exterior: { label: "Exterior", description: "Para brasileiros e praticantes fora do país." },
};
