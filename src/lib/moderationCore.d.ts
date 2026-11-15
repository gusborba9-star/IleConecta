export declare const WARNING_HOURS: number;
export declare const OLD_CONTENT_DAYS: number;
export declare const CONTEST_DAYS: number;
export declare const ADAPTATION_DAYS: number;
export declare const TARGET_LABEL: Record<string, string>;
export declare const REASON_LABEL: Record<string, string>;
export declare const STATUS_LABEL: Record<string, string>;
export declare const GENERAL_NOTICE_TEXT: string;
export declare const GENERAL_NOTICE_HREF: string;
export interface ModRowLike {
  status: string; reason: string; target_table: string; warned_at?: string | null; contested_at?: string | null;
  adaptation_start?: string | null; adaptation_days?: number;
}
export declare function deadlineText(reason: string): string;
export declare function inAdaptation(startIso: string | null | undefined, days?: number, now?: Date): boolean;
export declare function adaptationEnd(startIso: string | null | undefined, days?: number): Date | null;
export declare function adminActions(row: ModRowLike, now?: Date): { id: string; label: string; danger?: boolean }[];
export declare function houseMessage(row: ModRowLike): string[];
export declare function canContest(row: ModRowLike, now?: Date): boolean;
