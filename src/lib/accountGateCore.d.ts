export type GateState = "ok" | "bloqueada" | "inativa";
export interface AccountGate { state: GateState; role: "dono" | "equipe" | null; houseId: string | null; houseName: string; debtCents: number }
export function readGate(raw: unknown): AccountGate;
export function lockCopy(gate: AccountGate): { title: string; lead: string; action: "reativar" | "desbloquear" | "quitar" | null };
export interface CancelStatus { canCancel: boolean; reason: string | null; scheduled: boolean; cancelAt: string | null; nextRenewal: string | null; debtCents: number }
export function readCancelStatus(raw: unknown): CancelStatus | null;
export function brDate(iso: unknown): string;
export function cancelChoices(status: CancelStatus | null): { mode: "vencimento" | "agora"; title: string; text: string }[];
export function cancelDoneText(res: { mode?: string; cancelAt?: string | null; debtCents?: number } | null): string;
export function isLockedOpenPath(pathname: string): boolean;
export function brMoney(cents: unknown): string;
export function cancelDebtNote(status: CancelStatus | null): string;
export const CANCEL_NOW_CONFIRM: string;
