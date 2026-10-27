export type RefundReasonId = "nao_realizou" | "nao_entregou" | "cobranca_indevida" | "outro";
export declare const REFUND_REASONS: { id: RefundReasonId; label: string }[];
export declare const MIN_DETAILS: number;
export declare const MAX_DETAILS: number;
export declare function composeReason(id: RefundReasonId, details: string): string | null;
