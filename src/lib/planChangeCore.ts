/** Leitura do que o banco informa sobre a troca de plano (my_plan_change_status). Tudo que não for reconhecido vira "sem informação". */
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

const isPlan = (v: unknown): v is PlanId => v === "base" || v === "intermediario" || v === "maximo";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : NaN);

export const PLAN_RANK: Record<PlanId, number> = { base: 0, intermediario: 1, maximo: 2 };

export function readPlanChange(raw: unknown): PlanChangeStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.has_house !== true || !isPlan(r.plan)) return null;
  const upgrades: PlanChangeStatus["upgrades"] = {};
  const ups = r.upgrades && typeof r.upgrades === "object" ? (r.upgrades as Record<string, Record<string, unknown>>) : {};
  for (const [k, q] of Object.entries(ups)) {
    if (!isPlan(k) || !q || typeof q !== "object") continue;
    const amountCents = num(q.amount_cents);
    if (!(amountCents >= 100)) continue;
    upgrades[k] = { plan: k, amountCents, oldCents: num(q.old_cents), newCents: num(q.new_cents), daysLeft: num(q.days_left), daysTotal: num(q.days_total), cycleEnd: String(q.cycle_end ?? "") };
  }
  const blocked: PlanChangeStatus["upgradeBlocked"] = {};
  const bl = r.upgrade_blocked && typeof r.upgrade_blocked === "object" ? (r.upgrade_blocked as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(bl)) if (isPlan(k) && typeof v === "string") blocked[k] = v;
  return {
    subscribed: r.subscribed === true,
    cancelled: r.cancelled === true,
    plan: r.plan,
    pendingPlan: isPlan(r.pending_plan) ? r.pending_plan : null,
    pendingOn: typeof r.pending_on === "string" ? r.pending_on : null,
    upgrades,
    upgradeBlocked: blocked,
    downgradeBlocked: typeof r.downgrade_blocked === "string" ? r.downgrade_blocked : null,
  };
}
