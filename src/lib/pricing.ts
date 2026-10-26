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
    tagline: "Para ter a sua casa na rede.",
    benefits: [
      "Página completa da casa (foto de perfil, capa e informações)",
      "Publicações no feed e interação com os seguidores",
      "Cadastro de serviços e rituais",
      "Recebimento de mensagens dos clientes",
    ],
  },
  {
    id: "intermediario",
    tagline: "Atendimento que não para.",
    benefits: [
      "Tudo do plano anterior",
      "Assistente virtual que informa e orienta os clientes (até 300 respostas por mês)",
      "Horário de atendimento e orientações da casa configuráveis",
    ],
  },
  {
    id: "maximo",
    tagline: "A assistente que também fecha.",
    benefits: [
      "Tudo do plano anterior",
      "Assistente completa, até 3.000 respostas por mês",
      "Ajuda a fechar vendas, com pagamento por Pix e QR code gerado pelo sistema",
      "Descontos dentro do limite que a própria casa define",
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
