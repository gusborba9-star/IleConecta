export interface OperatorPublic { name: string; document: string; address: string | null; email: string | null }
export interface OperatorForm { name: string; document: string; address: string; email: string }
export const CPF_MASKED: RegExp;
export const CNPJ_FULL: RegExp;
export const EMAIL_RE: RegExp;
export const OPERATOR_SLUGS: string[];
export function documentKind(doc: string | null | undefined): "cpf" | "cnpj" | null;
export function operatorProblem(f: Partial<OperatorForm> | null | undefined): string | null;
export function operatorSentence(op: Partial<OperatorPublic> | null | undefined): string | null;
