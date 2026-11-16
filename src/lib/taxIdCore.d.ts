export const onlyDigits: (v: unknown) => string;
export function taxIdKind(value: unknown): "cpf" | "cnpj" | null;
export function formatTaxIdInput(value: unknown): string;
export interface TaxIdStatus { hasHouse: boolean; set: boolean; kind: "cpf" | "cnpj" | null; masked: string | null; subscribed: boolean }
export function readTaxIdStatus(raw: unknown): TaxIdStatus;
