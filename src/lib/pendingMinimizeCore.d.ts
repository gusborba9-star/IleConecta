export function shownPriority(item: { kind?: string; priority?: string } | null | undefined, opts?: { hasCredits?: boolean }): "alta" | "normal";
export function isCritical(item: { kind?: string; priority?: string; overdue?: boolean } | null | undefined, opts?: { hasCredits?: boolean }): boolean;
export function bubbleCount(view: { total?: number; toPay?: { count?: number } | null } | null | undefined): number;
export function badgeText(n: number): string;
export function bubbleLabel(n: number, overdue?: number): string;
export interface BubbleState { minimized: boolean }
export function readBubble(userId: string, storage?: Pick<Storage, "getItem">): BubbleState;
export function writeBubble(userId: string, state: BubbleState, storage?: Pick<Storage, "setItem">): void;
