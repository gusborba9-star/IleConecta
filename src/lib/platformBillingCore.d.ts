export const STATUS_LABELS: Record<string, string>;
export const KIND_LABELS: Record<string, string>;
export const METHOD_LABELS: Record<string, string>;
export type BillingMethod = "pix" | "card" | "card_recurring";
export interface BillingCharge {
  id: string; kind: string; description: string | null; amountCents: number; dueDate: string; status: string;
  toleranceEnd: string; totalOn: string; methods: BillingMethod[];
}
export interface BillingStatus { houseId: string | null; level: "ok" | "parcial" | "total"; overdue: boolean; charges: BillingCharge[] }
export interface AlertView { tone: "gold" | "danger"; title: string; text: string; totalCents: number; processing: boolean; level: "ok" | "parcial" | "total"; charges: BillingCharge[] }
export function statusLabel(s: string): string;
export function statusTone(s: string): "forest" | "danger" | "gold" | "muted" | "primary";
export function kindLabel(k: string): string;
export function shortDate(iso: string): string;
export function dayBefore(iso: string): string;
export function readStatus(raw: unknown): BillingStatus;
export function alertView(status: unknown, opts?: { inactive?: boolean }): AlertView | null;
export function payMethods(list: unknown): ("pix" | "card")[];
export function canPay(charge: { status?: string } | null | undefined): boolean;
export interface CardInput {
  hasHouse?: boolean; available?: boolean; hasCard?: boolean; brand?: string | null; last4?: string | null; expMonth?: number | null; expYear?: number | null;
  autoEnabled?: boolean; maxAttempts?: number; lastAttempt?: { attempt: number; outcome: string; at: string } | null;
}
export interface CardView { hasCard: boolean; title: string; expiry: string | null; expired: boolean; on: boolean; summary: string; problem: string | null; lastText: string | null }
export function cardView(status: CardInput | null | undefined, todayIso?: string): CardView | null;
export function authorizationText(input?: { planName?: string | null; amountCents?: number | null }): { period: "mensal"; planKey: string | null; amountCents: number | null; text: string };
