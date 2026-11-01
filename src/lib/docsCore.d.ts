export const DOC_TITLE_MAX: number;
export const DOC_BODY_MAX: number;
export function slugify(title: string): string;
export function validateDoc(input: { title?: string; body?: string }): { ok: true; title: string; body: string } | { ok: false; error: string };
export type InlinePart = { t: "text" | "b" | "code"; v: string };
export function parseInline(text: string): InlinePart[];
export type DocBlock =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "hr" }
  | { type: "list"; items: { depth: number; marker: string; text: string }[] }
  | { type: "table"; head: string[]; rows: string[][] };
export function parseBlocks(md: string): DocBlock[];
