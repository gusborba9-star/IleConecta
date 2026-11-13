export declare const FEE_KINDS: { key: "ritual" | "servico" | "mensalidade"; label: string }[];
export declare const MAX_FEE_BPS: number;
export declare function parsePercent(text: string): number | null;
export declare function formatPercent(bps: number): string;
export declare function changedKinds(current: Record<string, number> | null | undefined, next: Record<string, number> | null | undefined): string[];
