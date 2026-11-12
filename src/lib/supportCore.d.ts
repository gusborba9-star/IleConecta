export interface Kind { id: string; label: string; group: string; priority: "urgente" | "alta" | "normal"; help: string }
export const KINDS: Kind[];
export const PRIORITY_LABEL: Record<string, string>;
export const LGPD_KINDS: string[];
export const STATUS_LABEL: Record<string, string>;
export const DECISION_LABEL: Record<string, string>;
export const TITLE_MAX: number;
export const DESC_MAX: number;
export const CONSENT_TEXT: string;
export const EVIDENCE_CONSENT_TEXT: string;
export function isClosed(status: string): boolean;
export function kindLabel(id: string): string;
export function priorityText(kind: string, priority: string): string;
export function validateReport(i: { kind: string; title: string; description: string; consent: boolean }): string | null;
export function sortQueue<T extends { priority: string; first_response_due?: string | null }>(rows: T[]): T[];
export function validateSupportEmail(v: string): string | null;
