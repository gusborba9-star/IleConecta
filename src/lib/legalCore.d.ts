export type ConsentDocKey = "termos_cliente" | "dados_sensiveis" | "termos_casa";
export interface ConsentRow { doc_key: string; doc_version: string; accepted_at: string }
export type ConsentState = { status: "ok" | "old" | "never" | "withdrawn"; version?: string; at?: string };
export declare const LEGAL_VERSION: string;
export declare const LEGAL_VERSION_HISTORY: string[];
export declare const DOC_MIN_VERSION: Partial<Record<ConsentDocKey, string>>;
export declare const CONSENT_DOCS: Record<ConsentDocKey, { text: string; links: string[] }>;
export declare const CHECKOUT_DOCS: { ritual: ConsentDocKey[]; servico: ConsentDocKey[] };
export declare const REQUIRED_DOCS: { cliente: ConsentDocKey[]; casa: ConsentDocKey[] };
export declare const OPTIONAL_DOCS: { cliente: ConsentDocKey[]; casa: ConsentDocKey[] };
export declare function consentStatus(rows: ConsentRow[] | null | undefined, doc: ConsentDocKey, version: string): ConsentState;
export declare function gateDocs(accountType: string | undefined, rows: ConsentRow[] | null | undefined, version: string): { required: ConsentDocKey[]; optional: ConsentDocKey[] };
