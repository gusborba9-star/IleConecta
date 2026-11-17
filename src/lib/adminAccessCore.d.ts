export interface ModuleInfo { key: string; label: string; desc: string }
export const MODULES: ModuleInfo[];
export const MODULE_KEYS: string[];
export const OWNER_ONLY: string;
export const SECTION_NEEDS: Record<string, string[]>;
export interface AdminAccess { admin: boolean; owner: boolean; perms: readonly string[] }
export const NO_ACCESS: AdminAccess;
export function readAccess(raw: unknown): AdminAccess;
export function canModule(access: AdminAccess | null | undefined, module: string): boolean;
export function canSection(access: AdminAccess | null | undefined, section: string): boolean;
export function allowedSections<T extends string>(access: AdminAccess | null | undefined, order: readonly T[]): T[];
export interface AdminMember { userId: string; email: string; name: string; owner: boolean; perms: string[]; createdAt: string }
export function readAdminRow(raw: unknown): AdminMember | null;
export function readAdminList(raw: unknown): AdminMember[];
export function togglePerm(perms: string[], key: string): string[];
