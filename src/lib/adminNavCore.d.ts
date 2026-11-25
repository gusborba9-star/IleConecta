import type { AdminAccess } from "./adminAccessCore.js";
export interface AdminScreen { id: string; module: string; title: string; desc: string; keys: string; need: string }
export interface AdminModule { id: string; label: string; group: string; desc: string }
export const ADMIN_SCREENS: AdminScreen[];
export const ADMIN_MODULES: AdminModule[];
export const ADMIN_GROUPS: string[];
export const BAR_PRIORITY: string[];
export function screenById(id: unknown): AdminScreen | null;
export function moduleById(id: unknown): AdminModule | null;
export function canScreen(access: AdminAccess | null | undefined, screen: AdminScreen | null): boolean;
export function screensOf(access: AdminAccess | null | undefined, moduleId: string): AdminScreen[];
export function visibleModules(access: AdminAccess | null | undefined): AdminModule[];
export type AdminNav =
  | { kind: "none" }
  | { kind: "hub" }
  | { kind: "module"; module: AdminModule; screens: AdminScreen[] }
  | { kind: "screen"; module: AdminModule; screen: AdminScreen; single: boolean };
export function resolveNav(access: AdminAccess | null | undefined, rawS: unknown, rawC: unknown): AdminNav;
export function navPath(moduleId?: string | null, screenId?: string | null): string;
export function searchScreens(access: AdminAccess | null | undefined, q: string, limit?: number): AdminScreen[];
export function adminTo(moduleId?: string | null, screenId?: string | null): { search: string };
