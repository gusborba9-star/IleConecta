export type ServiceKind = "trabalho" | "buzios" | "cartas" | "consulta" | "limpeza" | "outro";
export type ServiceDelivery = "presencial" | "transmissao" | "sigilo";

export interface ServiceFormInput {
  kind: ServiceKind | "";
  customKind: string;
  title: string;
  description: string;
  priceText: string;
  delivery: ServiceDelivery | "";
  /** Em quantas etapas de pagamento o serviço é pago (1 a 4). */
  stages?: number | string;
}
export interface ServiceValue {
  kind: ServiceKind;
  custom_kind: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  delivery: ServiceDelivery;
  stages: number;
}
export type ServiceValidation =
  | { ok: true; errors: Record<string, never>; value: ServiceValue }
  | { ok: false; errors: Partial<Record<"kind" | "customKind" | "title" | "description" | "price" | "delivery" | "stages", string>>; value: null };

export declare const SERVICE_KINDS: { id: ServiceKind; label: string }[];
export declare const SERVICE_DELIVERIES: { id: ServiceDelivery; label: string; hint: string }[];
export declare const MAX_PRICE_CENTS: number;
export declare function parsePriceToCents(text: string): number | null;
export declare function formatCents(cents: number): string;
export declare function kindLabel(kind: string, customKind?: string | null): string;
export declare function deliveryLabel(delivery: string): string;
export declare function validateService(input: ServiceFormInput): ServiceValidation;
