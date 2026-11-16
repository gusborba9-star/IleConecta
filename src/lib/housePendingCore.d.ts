import type { PendingItem } from "./pendingCenterCore.js";
export { dueText, filterPending } from "./pendingCenterCore.js";
export const HOUSE_KIND_LABELS: Record<string, string>;
export const HOUSE_PRIORITY_LABELS: Record<string, string>;
export function houseTarget(tab: string | null, role: "titular" | "equipe"): { path: string | null; label: string } | null;
export interface HousePendingItem extends Omit<PendingItem, "houseId" | "houseName" | "priority"> { priority: "alta" | "normal" }
export interface ToPayCharge { id: string; kind: string; description: string; amountCents: number; dueDate: string; status: string; pixDiscountCents: number; overdue: boolean }
export interface HousePendingView { houseId: string | null; houseName: string | null; role: "titular" | "equipe"; total: number; overdue: number; shown: number; counts: Record<string, number>; items: HousePendingItem[]; toPay: { totalCents: number; count: number; charges: ToPayCharge[] } | null }
export function readHousePending(raw: unknown): HousePendingView;
