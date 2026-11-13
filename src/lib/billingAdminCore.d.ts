export type Method = "pix" | "card" | "card_recurring";
export const KINDS: string[];
export const KIND_ADMIN_LABELS: Record<string, string>;
export const METHODS: Method[];
export const METHOD_LABELS: Record<string, string>;
export const DEFAULT_TOTAL_DAYS: number;
export interface ConfigForm { enabled: boolean; noticeDays: number | string; toleranceDays: number | string; totalDays: number | string; methods: Record<string, Method[]>; provider: Record<string, string> }
export function readConfig(raw: unknown): ConfigForm;
export function buildConfig(f: ConfigForm): { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
export function needsEnableConfirm(before: { enabled: boolean }, after: { enabled: boolean }): boolean;
export function toggleMethod(list: Method[], method: Method): Method[];
export interface AdminCharge { id: string; houseId: string; kind: string; description: string | null; amountCents: number; dueDate: string; status: string; feeCents: number | null }
export function readAdminCharge(r: unknown): AdminCharge;
export const CANCELABLE: string[];
export function canCancel(status: string): boolean;
