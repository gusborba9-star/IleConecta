export type ServiceKind = "trabalho" | "buzios" | "cartas" | "consulta" | "limpeza" | "outro";
export type ServiceDelivery = "presencial" | "transmissao" | "hibrido" | "sigilo";

export interface ServiceFormInput {
  kind: ServiceKind | "";
  customKind: string;
  title: string;
  description: string;
  priceText: string;
  delivery: ServiceDelivery | "";
  /** Em quantas etapas de pagamento o serviço é pago (1 a 4). */
  stages?: number | string;
  /** Cliente escolhe dia e horário na agenda da casa (búzios, cartas, consulta). */
  bookable?: boolean;
  durationMin?: number | string;
}
export interface ServiceValue {
  kind: ServiceKind;
  custom_kind: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  delivery: ServiceDelivery;
  stages: number;
  bookable: boolean;
  duration_min: number;
}
export type ServiceValidation =
  | { ok: true; errors: Record<string, never>; value: ServiceValue }
  | { ok: false; errors: Partial<Record<"kind" | "customKind" | "title" | "description" | "price" | "delivery" | "stages" | "bookable" | "durationMin", string>>; value: null };

export declare const SERVICE_KINDS: { id: ServiceKind; label: string }[];
export declare const SERVICE_DELIVERIES: { id: ServiceDelivery; label: string; hint: string }[];
export declare const BOOKABLE_KINDS: string[];
export declare const MAX_PRICE_CENTS: number;
/** Descrição mínima (letras) de serviços e rituais. */
export declare const MIN_DESCRIPTION: number;
export declare function descriptionTooShort(length: number): string;
export declare function parsePriceToCents(text: string): number | null;
export declare function formatCents(cents: number): string;
export declare function kindLabel(kind: string, customKind?: string | null): string;
export declare function deliveryLabel(delivery: string): string;
export declare function validateService(input: ServiceFormInput): ServiceValidation;
