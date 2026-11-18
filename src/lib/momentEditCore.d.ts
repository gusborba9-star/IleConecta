export const OUT_W: number; export const OUT_H: number; export const ZOOM_MIN: number; export const ZOOM_MAX: number;
export const TEXT_MAX: number; export const LAYERS_MAX: number; export const SIZE_MIN: number; export const SIZE_MAX: number;
export const TEXT_SIZE_DEFAULT: number; export const EMOJI_SIZE_DEFAULT: number;
export interface EditFont { key: string; label: string; family: string; weight: number }
export interface EditColor { hex: string; label: string }
export const EDIT_FONTS: EditFont[]; export const EDIT_COLORS: EditColor[]; export const EDIT_EMOJIS: string[];
export interface EditFrame { scale: number; cx: number; cy: number }
export interface EditLayer { id: string; kind: "text" | "emoji"; text: string; font: string; color: string; size: number; x: number; y: number }
export interface LayerBox { id: string; x: number; y: number; w: number; h: number }
export function defaultFrame(): EditFrame;
export function isDefaultFrame(f: EditFrame | null | undefined): boolean;
export function imageRect(iw: number, ih: number, W: number, H: number, frame: EditFrame): { x: number; y: number; w: number; h: number };
export function coverScale(iw: number, ih: number, W: number, H: number): number;
export function clampFrame(iw: number, ih: number, W: number, H: number, frame: EditFrame): EditFrame;
export function pinchValue(start: number, startDist: number, dist: number, min: number, max: number): number;
export function newLayerId(): string;
export function cleanText(raw: unknown): string;
export function makeLayer(kind: "text" | "emoji", text: string, opts?: Partial<EditLayer>): EditLayer | null;
export function sanitizeLayer(l: unknown): EditLayer | null;
export function sanitizeLayers(list: unknown): EditLayer[];
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[];
export function hitLayer(boxes: LayerBox[], px: number, py: number): string | null;
