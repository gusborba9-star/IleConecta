export interface Maintenance { assistant: boolean; payments: boolean; message: string | null; since: string | null; any: boolean }
export const MAINTENANCE_LABEL: Record<"assistant" | "payments", string>;
export const MAINTENANCE_DEFAULT: Record<"assistant" | "payments", string>;
export function readMaintenance(raw: unknown): Maintenance;
export function maintenanceBanner(m: Maintenance | null | undefined): string | null;
