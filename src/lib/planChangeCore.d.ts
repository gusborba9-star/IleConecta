import type { PlanId } from "@/lib/pricing";

export interface UpgradeQuote { plan: PlanId; amountCents: number; oldCents: number; newCents: number; daysLeft: number; daysTotal: number; cycleEnd: string }
export interface PlanChangeStatus {
  subscribed: boolean;
  cancelled: boolean;
  plan: PlanId;
  pendingPlan: PlanId | null;
  pendingOn: string | null;
  upgrades: Partial<Record<PlanId, UpgradeQuote>>;
  upgradeBlocked: Partial<Record<PlanId, string>>;
  downgradeBlocked: string | null;
}
export const PLAN_RANK: Record<PlanId, number>;
/** Leitura do que o banco informa sobre a troca de plano (my_plan_change_status). Tudo que não for reconhecido vira "sem informação". */
export function readPlanChange(raw: unknown): PlanChangeStatus | null;
