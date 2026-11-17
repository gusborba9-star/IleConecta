export interface AuditEntry { id: number; key: string; createdAt: string; adminId: string | null; actor: string }
export function readAudit(raw: unknown): AuditEntry[];
export function mergeAudit(a: AuditEntry[], b: AuditEntry[]): AuditEntry[];
export function filterAudit(rows: AuditEntry[], adminId: string | null | undefined): AuditEntry[];
export function actors(rows: AuditEntry[]): { id: string; name: string }[];
