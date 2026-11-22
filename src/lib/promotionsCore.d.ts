export type PromoKind = "boost" | "highlight";
export type PromoScopeKey = "cidade" | "estado" | "pais";
export declare const PROMO_SCOPES: PromoScopeKey[];
export declare const SCOPE_NAME: Record<PromoScopeKey, string>;
export declare const KIND_NAME: Record<PromoKind, string>;
export interface MyPromo {
  id: string; kind: PromoKind; scope: PromoScopeKey; itemType: string | null; itemId: string | null; title: string | null; days: number; status: string;
  chargeId: string | null; paidCents: number | null; startsAt: string | null; endsAt: string | null; running: boolean; queued: boolean; paused: boolean;
  views: number; opens: number; daysLeft: number | null; daysUsed: number | null; refundCents: number | null; refundDays: number | null; refundDeadline: string | null;
}
export declare function readMyPromotions(raw: unknown): { hasHouse: boolean; items: MyPromo[] };
export interface ScopeSlots { limit: number; taken: number; full: boolean; mine: boolean; waiting: boolean; located: boolean }
export declare function readAvailability(raw: unknown): { hasHouse: boolean; scopes: Record<PromoScopeKey, ScopeSlots> };
export declare function endsLabel(iso: string | null | undefined): string;
export declare function countdownText(iso: string | null | undefined, now?: number): string;
export declare function promoLine(i: MyPromo, now?: number): string;
export declare function promoRefundText(i: MyPromo, money: (cents: number) => string): string;
export declare function promoName(i: MyPromo): string;

export declare function editDaysDraft(raw: string, cap?: number): { text: string; days: number | null };

export interface PromoFunnel { chats: number; checkouts: number; payments: number; devicesNew?: number }
export declare function resultsLine(i: { views?: number; opens?: number }, f?: PromoFunnel): string;
export declare function readFunnel(raw: unknown): Record<string, PromoFunnel>;
export interface FeedPostLike { id: string; houseId: string; kind?: string }
export declare function rankFeed<T extends FeedPostLike>(posts: T[], promo?: { highlightOwners?: string[]; boostedPostIds?: string[] }): { post: T; tag: "destaque" | "promovido" | null }[];
