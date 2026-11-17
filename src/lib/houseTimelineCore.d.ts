export const EVENT_LABELS: Record<string, string>;
export const PLAN_REASON_LABELS: Record<string, string>;
export interface TimelineEvent { at: string; kind: string; refId: string; title: string; detail: string; amountCents: number | null; status: string }
export interface TimelineCharge { id: string; kind: string; description: string; amountCents: number; dueDate: string; status: string; overdue: boolean; pixDiscountCents: number; pixDiscountUntil: string | null }
export interface HouseTimelineView { house: { id: string; name: string; plan: string; createdAt: string } | null; toPay: { totalCents: number; count: number; charges: TimelineCharge[] } | null; events: TimelineEvent[]; hasMore: boolean; nextBefore: string | null }
export function readHouseTimeline(raw: unknown): HouseTimelineView;
export function mergeEvents(a: TimelineEvent[], b: TimelineEvent[]): TimelineEvent[];
export function filterEvents(events: TimelineEvent[], kind?: string): TimelineEvent[];
export function eventDetail(e: TimelineEvent): string;
export function readHouseParam(raw: unknown): string | null;
