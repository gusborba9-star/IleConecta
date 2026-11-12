export const ANOMALY_LABELS: Record<string, string>;
export const SEVERITY_LABELS: Record<string, string>;
export const KIND_LABELS: Record<string, string>;
export function formatCents(cents: unknown): string;
export function kindLabel(kind: string): string;
export function anomalyLabel(code: string): string;
export function severityTone(sev: string): "danger" | "gold" | "muted";
export interface FinanceSummary {
  days: number; feeRuleVersion: string; payments: number; confirmedN: number; confirmedGross: number; platformFee: number;
  processorFeeKnown: number; processorFeePendingN: number; refundedN: number; refundedGross: number; failedN: number; pendingN: number; contestedN: number;
  byKind: { kind: string; n: number; gross: number; fee: number }[];
  refundsOpenN: number; refundsOpenOldestDays: number; refundsCompletedN: number;
}
export interface FinanceAnomaly { code: string; severity: "alta" | "media" | "baixa"; paymentId: string; detail: string; amount: number; at: string }
export interface FinanceAnomalies { total: number; shown: number; scope: string; items: FinanceAnomaly[] }
export function readSummary(raw: unknown): FinanceSummary;
export function readAnomalies(raw: unknown): FinanceAnomalies;
