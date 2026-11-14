/** Leitura do que o banco informa sobre a troca de plano (my_plan_change_status). Tudo que não for reconhecido vira "sem informação". */
const isPlan = (v) => v === "base" || v === "intermediario" || v === "maximo";
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : NaN);

export const PLAN_RANK = { base: 0, intermediario: 1, maximo: 2 };

export function readPlanChange(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  if (r.has_house !== true || !isPlan(r.plan)) return null;
  const upgrades = {};
  const ups = r.upgrades && typeof r.upgrades === "object" ? r.upgrades : {};
  for (const [k, q] of Object.entries(ups)) {
    if (!isPlan(k) || !q || typeof q !== "object") continue;
    const amountCents = num(q.amount_cents);
    if (!(amountCents >= 100)) continue;
    upgrades[k] = { plan: k, amountCents, oldCents: num(q.old_cents), newCents: num(q.new_cents), daysLeft: num(q.days_left), daysTotal: num(q.days_total), cycleEnd: String(q.cycle_end ?? "") };
  }
  const blocked = {};
  const bl = r.upgrade_blocked && typeof r.upgrade_blocked === "object" ? r.upgrade_blocked : {};
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
