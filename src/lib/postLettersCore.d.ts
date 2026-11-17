import type { CardMode } from "@/lib/postCardCore";
export interface Letters { font: string | null; size: string | null; color: string | null; align: string | null; pos: string | null; bold: boolean; italic: boolean }
export interface LetterOption { id: string; label: string }
export const FONTS: (LetterOption & { family: string; scale: number; weight: number; bold: number })[];
export const SIZES: (LetterOption & { total: number; parcial: number })[];
export const COLORS_TOTAL: (LetterOption & { hex: string })[];
export const COLORS_PARCIAL: (LetterOption & { hex: string })[];
export const PAPER: string;
export const ALIGNS: LetterOption[];
export const POSITIONS: LetterOption[];
export const EMPTY_LETTERS: Letters;
export function colorsFor(mode: CardMode): (LetterOption & { hex: string })[];
export function normalizeLetters(x: unknown): Letters;
export function fitToMode(letters: unknown, mode: CardMode): Letters;
export function isDefaultLetters(letters: unknown): boolean;
export function lettersToColumns(letters: unknown): { card_font: string | null; card_size: string | null; card_color: string | null; card_align: string | null; card_pos: string | null; card_bold: boolean; card_italic: boolean };
export function lettersFromRow(row: unknown): Letters;
export function hexLum(hex: string): number;
export function scrimPctFor(brightness: number, colorId: string | null): number;
export function lettersLook(letters: unknown, mode: CardMode): { custom: boolean; family: string | null; fontSizePx: number | null; weight: number | null; italic: boolean; color: string | null; align: string | null; pos: string | null };
