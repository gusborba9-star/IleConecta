import type { PlanCaps } from "@/lib/planMatrixCore";
export type MomentKind = "image" | "video";
export interface MomentLink { kind: "service" | "event"; id: string; title: string }
export interface MomentItem { id: string; kind: MomentKind; url: string; poster: string | null; caption: string | null; createdAt: string; expiresAt: string; duration: number | null; link: MomentLink | null }
export interface MomentGroup { ownerId: string; houseId: string; name: string; slug: string; avatar?: string; followed: boolean; items: MomentItem[] }
export declare const IMAGE_SECONDS: number;
export declare const MAX_VIDEO_SECONDS: number;
export declare const MAX_MOMENT_BYTES: number;
export declare const CAPTION_MAX: number;
export declare const REPORT_REASONS: { id: string; label: string }[];
export declare function canPostMoments(caps: Partial<PlanCaps> | null | undefined): boolean;
export declare function canPostVideo(caps: Partial<PlanCaps> | null | undefined): boolean;
export declare function remainingToday(caps: Partial<PlanCaps> | null | undefined, publishedLast24h: number): number;
export declare function validateMomentFile(file: { type?: string; size?: number } | null | undefined, caps: Partial<PlanCaps> | null | undefined): string | null;
export declare function isVideoType(type: string): boolean;
export declare function extFor(type: string): string | null;
export declare function momentPath(ownerId: string, rand: string, ext: string): string | null;
export declare function safeFilePath(p: unknown): string | null;
export declare function itemSeconds(item: { kind?: string; duration?: number | null }): number;
export declare function normalizeFeed(raw: unknown, urlFor?: (path: string) => string | undefined | null): MomentGroup[];
export declare function isGroupSeen(group: MomentGroup, seen: Set<string>): boolean;
export declare function startIndex(group: MomentGroup, seen: Set<string>): number;
export declare function sortGroups(groups: MomentGroup[], opts?: { highlightOwners?: string[]; seen?: Set<string> }): MomentGroup[];
export declare function nextPosition(groups: MomentGroup[], gi: number, ii: number): { gi: number; ii: number } | null;
export declare function prevPosition(groups: MomentGroup[], gi: number, ii: number): { gi: number; ii: number };
export declare function jumpGroup(groups: MomentGroup[], gi: number, dir: number): { gi: number; ii: number } | null;
export declare function parseSeen(raw: string | null | undefined): Set<string>;
export declare function serializeSeen(seen: Set<string>, liveIds?: string[]): string;
export declare function timeAgoPt(iso: string, now?: number): string;
export declare function expiresInPt(iso: string, now?: number): string;
