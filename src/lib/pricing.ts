// Única fonte dos preços de planos, impulsionamento e destaques.
// null = valor ainda não definido pela diretoria (a tela mostra "A definir" e o total fica em branco).
// Para publicar um preço, basta trocar o null pelo valor em reais (ex.: 4.9) e fazer o deploy.

export type Money = number | null;

export type BoostScope = "cidade" | "estado" | "pais";
export type HighlightScope = "local" | "cidade" | "pais";

/** Impulsionamento: valor por dia, conforme o alcance geográfico. */
export const BOOST_PER_DAY: Record<BoostScope, Money> = { cidade: null, estado: null, pais: null };

/** Destaque nos feeds: valor por dia, conforme a região. */
export const HIGHLIGHT_PER_DAY: Record<HighlightScope, Money> = { local: null, cidade: null, pais: null };

export const DAY_PRESETS = [3, 7, 30] as const;
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;

export type PlanId = "base" | "intermediario" | "maximo";

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** Mensalidade em reais; null = a definir. */
  monthly: Money;
  tagline: string;
  benefits: string[];
}

export const PLANS: PlanInfo[] = [
  {
    id: "base",
    name: "Base",
    monthly: null,
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
    name: "Intermediário",
    monthly: null,
    tagline: "Atendimento que não para.",
    benefits: [
      "Tudo do plano Base",
      "Assistente virtual que informa e orienta os clientes (até 300 respostas por mês)",
      "Horário de atendimento e orientações da casa configuráveis",
    ],
  },
  {
    id: "maximo",
    name: "Máximo",
    monthly: null,
    tagline: "A assistente que também fecha.",
    benefits: [
      "Tudo do plano Intermediário",
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
  return Math.round(perDay * 100) * Math.floor(days) / 100;
}

export function clampDays(n: number): number {
  if (!Number.isFinite(n)) return MIN_DAYS;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(n)));
}
