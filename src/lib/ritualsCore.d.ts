export type RitualMode = "presencial" | "distancia" | "hibrido" | "sigilo";
export interface IntakeField { id: string; label: string; required: boolean }
export interface RitualFormInput {
  title: string;
  description: string;
  priceText: string;
  seatsText: string;
  mode: RitualMode | "";
  date: string;
  time: string;
  streamUrl: string;
  fields: { id?: string; label: string; required?: boolean }[];
  allowPast?: boolean;
}
export interface RitualValue {
  title: string;
  description: string | null;
  price_cents: number;
  seats_total: number;
  mode: RitualMode;
  starts_at: string;
  intake_fields: IntakeField[];
  stream_url: string | null;
}
export type RitualValidation =
  | { ok: true; errors: Record<string, never>; value: RitualValue }
  | { ok: false; errors: Partial<Record<"title" | "description" | "price" | "seats" | "mode" | "when" | "streamUrl", string>>; value: null };
export type AnswersValidation =
  | { ok: true; errors: Record<string, never>; value: Record<string, string> }
  | { ok: false; errors: Record<string, string>; value: null };

export const RITUAL_MODES: { id: RitualMode; label: string; hint: string }[];
export const FIELD_PRESETS: { id: string; label: string }[];
export const MAX_FIELDS: number;
export const MAX_SEATS: number;
export function modeLabel(mode: string): string;
export function seatsLeft(total: number, taken: number): number;
export function seatsState(total: number, taken: number): "esgotado" | "ultimas" | "abertas";
export function grossCents(priceCents: number, taken: number): number;
export function toStartsAtIso(dateText: string, timeText: string): string | null;
export function fromIsoToBrt(iso: string): { date: string; time: string };
export function normalizeFields(fields: unknown): IntakeField[];
export function validateRitual(input: RitualFormInput, now?: Date): RitualValidation;
export function validateAnswers(fields: IntakeField[], answers: Record<string, string>): AnswersValidation;
