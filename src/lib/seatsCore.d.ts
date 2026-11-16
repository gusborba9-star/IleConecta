export interface SeatStatus {
  hasHouse: boolean; subscribed: boolean; included: number; extra: number; inUse: number;
  quote: { amountCents: number; monthlyCents: number; daysLeft: number; daysTotal: number; cycleEnd: string | null } | null;
  blocked: string | null; releaseTo: number | null; releaseOn: string | null;
}
export function readSeatStatus(raw: unknown): SeatStatus;
export function dateBR(isoDate: string | null): string;
export function keepOptions(st: SeatStatus): number[];
export function canBuySeat(st: SeatStatus): boolean;
