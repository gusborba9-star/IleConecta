export declare const MONEY_MAX_DIGITS: number;
export declare function maskMoney(text: string): string;
export declare function applyMoneyEdit(previous: string, next: string): string;
export declare function centsToMasked(cents: number | null | undefined): string;
export declare function maskedToCents(text: string): number | null;
