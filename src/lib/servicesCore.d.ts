export type ServiceKind = "trabalho" | "buzios" | "cartas" | "consulta" | "limpeza" | "outro";
export type ServiceDelivery = "presencial" | "transmissao" | "sigilo";

export interface ServiceFormInput {
  kind: ServiceKind | "";
  customKind: string;
  title: string;
  description: string;
  priceText: string;
  delivery: ServiceDelivery | "";
}
export interface ServiceValue {
  kind: ServiceKind;
  custom_kind: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  delivery: ServiceDelivery;
}
export type ServiceValidation =
  | { ok: true; errors: Record<string, never>; value: ServiceValue }
  | { ok: false; errors: Partial<Record<"kind" | "customKind" | "title" | "description" | "price" | "delivery", string>>; value: null };

export const SERVICE_KINDS: { id: ServiceKind; label: string }[];
export const SERVICE_DELIVERIES: { id: ServiceDelivery; label: string; hint: string }[];
export const MAX_PRICE_CENTS: number;
export function parsePriceToCents(text: string): number | null;
export function formatCents(cents: number): string;
export function kindLabel(kind: string, customKind?: string | null): string;
export function deliveryLabel(delivery: string): string;
export function validateService(input: ServiceFormInput): ServiceValidation;
