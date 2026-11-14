export type PackKey = "p80" | "p200" | "p500";
export const PACK_ORDER: PackKey[];
export const PACK_SIZE: Record<PackKey, number>;
export interface CreditPack { size: number; remaining: number; expiresAt: string }
export interface CreditOffer { key: PackKey; size: number; priceCents: number }
export interface Credits { limit: number; used: number; balance: number; forSale: boolean; packs: CreditPack[]; offers: CreditOffer[] }
export interface FranchiseView { used: number; limit: number; left: number; pct: number; over: number; exhausted: boolean; tone: "forest" | "gold" | "danger" }
export function readCredits(raw: unknown): Credits | null;
export function franchiseView(c: Credits | null): FranchiseView | null;
export function statusText(c: Credits | null): string;
export function expiryText(iso: string, now?: number): string;
export function offerLabel(o: CreditOffer): string;
export interface RefundItem { chargeId: string; size: number; remaining: number; paidCents: number | null; refundCents: number; deadline: string }
export interface RefundHistory { amountCents: number; credits: number; status: "concluido" | "pendente"; at: string }
export interface Refunds { items: RefundItem[]; history: RefundHistory[]; windowDays: number }
export function readRefunds(raw: unknown): Refunds;
export function refundText(i: RefundItem, now?: number): { money: string; line: string };

export interface PlanRefund { cancelled: boolean; returning: boolean; refundBlocked: boolean; eligible: boolean; chargeId: string | null; amountCents: number; deadline: string; windowDays: number; history: { at: string; status: "pendente" | "concluido" | "falhou"; amountCents: number }[] }
export function readPlanRefund(raw: unknown): PlanRefund | null;
export function planRefundText(p: PlanRefund, now?: number): { money: string; line: string };

export const RETURNING_REFUND_TEXT: string;
