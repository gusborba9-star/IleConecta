export function shownPriority(item: { kind?: string; priority?: string } | null | undefined, opts?: { hasCredits?: boolean }): "alta" | "normal";
export function bubbleCount(view: { total?: number; toPay?: { count?: number } | null } | null | undefined): number;
export function badgeText(n: number): string;
export function bubbleLabel(n: number, overdue?: number): string;
export interface BubbleState { minimized: boolean; overdue: number }
export function readBubble(userId: string, storage?: Pick<Storage, "getItem">): BubbleState;
export function writeBubble(userId: string, state: BubbleState, storage?: Pick<Storage, "setItem">): void;
export function shouldReopen(state: BubbleState, overdueNow: number): boolean;
