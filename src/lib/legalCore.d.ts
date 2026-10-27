export type ConsentDocKey = "checkout_ritual" | "checkout_servico" | "dados_sensiveis" | "termos_casa";
export declare const LEGAL_VERSION: string;
export declare const CONSENT_DOCS: Record<ConsentDocKey, { text: string; links: string[] }>;
export declare const CHECKOUT_DOCS: { ritual: ConsentDocKey[]; servico: ConsentDocKey[] };
