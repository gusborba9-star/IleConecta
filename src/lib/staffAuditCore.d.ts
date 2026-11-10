export declare const PERM_LABEL: Record<string, string>;
export interface StaffAuditEvent {
  id: number; houseId: string; action: string; actorRole: string; targetName: string | null; details: Record<string, unknown>; createdAt: string;
}
export declare function actorLabel(role: string): string;
export declare function describeStaffEvent(e: Pick<StaffAuditEvent, "action" | "targetName" | "details">): string;
export declare function validateAuditReason(text: unknown): string | null;
export declare function toAuditEvent(r: Record<string, unknown>): StaffAuditEvent;
